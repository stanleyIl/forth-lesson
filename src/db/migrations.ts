export type Migration = {
  id: string;
  sql: string;
  testSql?: string;
};

export const migrations: Migration[] = [
  {
    id: "001_initial_schema",
    sql: `
      CREATE TABLE classes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        account_identifier TEXT NOT NULL UNIQUE CHECK (length(trim(account_identifier)) > 0),
        password_hash TEXT NOT NULL CHECK (length(trim(password_hash)) > 0),
        role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE sessions (
        id_hash TEXT PRIMARY KEY CHECK (length(trim(id_hash)) > 0),
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMPTZ NOT NULL,
        CHECK (expires_at > created_at)
      );

      CREATE TABLE materials (
        id TEXT PRIMARY KEY,
        uploader_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        original_filename TEXT NOT NULL CHECK (length(trim(original_filename)) > 0),
        storage_key TEXT NOT NULL UNIQUE CHECK (length(trim(storage_key)) > 0),
        file_type TEXT NOT NULL CHECK (file_type IN ('txt', 'md')),
        size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (id, class_id)
      );

      CREATE TABLE knowledge_entries (
        id TEXT PRIMARY KEY,
        material_id TEXT NOT NULL,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        content TEXT NOT NULL CHECK (length(trim(content)) > 0),
        sequence_number INTEGER NOT NULL CHECK (sequence_number >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (material_id, class_id)
          REFERENCES materials(id, class_id)
          ON DELETE CASCADE,
        UNIQUE (material_id, sequence_number)
      );

      CREATE INDEX users_class_id_idx ON users(class_id);
      CREATE INDEX sessions_user_id_idx ON sessions(user_id);
      CREATE INDEX sessions_class_id_idx ON sessions(class_id);
      CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
      CREATE INDEX materials_class_created_idx ON materials(class_id, created_at);
      CREATE INDEX knowledge_entries_class_material_idx
        ON knowledge_entries(class_id, material_id);
    `,
  },
  {
    id: "002_knowledge_retrieval",
    sql: `
      CREATE EXTENSION IF NOT EXISTS vector;
      ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS search_document TEXT NOT NULL DEFAULT '';
      ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED;
      UPDATE knowledge_entries SET search_document = content WHERE search_document = '';
      CREATE TABLE IF NOT EXISTS knowledge_entry_embeddings (
        knowledge_entry_id TEXT PRIMARY KEY REFERENCES knowledge_entries(id) ON DELETE CASCADE,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        model_identity TEXT NOT NULL,
        embedding vector,
        embedding_json TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (embedding_json IS NOT NULL OR status <> 'ready')
      );
      CREATE INDEX IF NOT EXISTS knowledge_entries_class_search_idx
        ON knowledge_entries(class_id, search_document);
      CREATE INDEX IF NOT EXISTS knowledge_entries_search_vector_idx
        ON knowledge_entries USING GIN(search_vector);
      CREATE INDEX IF NOT EXISTS knowledge_entry_embeddings_class_model_status_idx
        ON knowledge_entry_embeddings(class_id, model_identity, status);
      CREATE INDEX IF NOT EXISTS knowledge_entry_embeddings_entry_class_idx
        ON knowledge_entry_embeddings(knowledge_entry_id, class_id);
    `,
    testSql: `
      ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS search_document TEXT NOT NULL DEFAULT '';
      UPDATE knowledge_entries SET search_document = content WHERE search_document = '';
      CREATE TABLE IF NOT EXISTS knowledge_entry_embeddings (
        knowledge_entry_id TEXT PRIMARY KEY REFERENCES knowledge_entries(id) ON DELETE CASCADE,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        model_identity TEXT NOT NULL,
        embedding TEXT,
        embedding_json TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (embedding_json IS NOT NULL OR status <> 'ready')
      );
      CREATE INDEX IF NOT EXISTS knowledge_entries_class_search_idx ON knowledge_entries(class_id, search_document);
      CREATE INDEX IF NOT EXISTS knowledge_entries_search_document_idx ON knowledge_entries(class_id, search_document);
      CREATE INDEX IF NOT EXISTS knowledge_entry_embeddings_class_model_status_idx ON knowledge_entry_embeddings(class_id, model_identity, status);
      CREATE INDEX IF NOT EXISTS knowledge_entry_embeddings_entry_class_idx ON knowledge_entry_embeddings(knowledge_entry_id, class_id);
    `,
  },
  {
    id: "003_database_native_retrieval",
    sql: `
      UPDATE knowledge_entry_embeddings
      SET embedding = embedding_json::vector
      WHERE status = 'ready' AND embedding IS NULL AND embedding_json IS NOT NULL;
      ALTER TABLE knowledge_entry_embeddings
        ADD CONSTRAINT knowledge_entry_embeddings_ready_vector_check
        CHECK (status <> 'ready' OR embedding IS NOT NULL);
    `,
    testSql: `
      UPDATE knowledge_entry_embeddings
      SET embedding = embedding_json
      WHERE status = 'ready' AND embedding IS NULL AND embedding_json IS NOT NULL;
    `,
  },
  {
    id: "004_jwt_chunks_assistant",
    sql: `
      CREATE TABLE access_token_sessions (
        jti_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX access_token_sessions_user_idx ON access_token_sessions(user_id);
      CREATE INDEX access_token_sessions_expiry_idx ON access_token_sessions(expires_at);

      CREATE TABLE knowledge_chunks (
        id TEXT PRIMARY KEY,
        generation_id TEXT NOT NULL,
        knowledge_entry_id TEXT NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
        material_id TEXT NOT NULL,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        strategy TEXT NOT NULL CHECK (strategy IN ('auto', 'separator', 'markdown_heading')),
        chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
        chunk_text TEXT NOT NULL CHECK (length(trim(chunk_text)) > 0),
        search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', chunk_text)) STORED,
        start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
        end_offset INTEGER NOT NULL CHECK (end_offset > start_offset),
        index_status TEXT NOT NULL CHECK (index_status IN ('pending', 'ready', 'failed')),
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (material_id, class_id) REFERENCES materials(id, class_id) ON DELETE CASCADE,
        UNIQUE (knowledge_entry_id, generation_id, chunk_index)
      );
      CREATE INDEX knowledge_chunks_class_status_idx ON knowledge_chunks(class_id, index_status);
      CREATE INDEX knowledge_chunks_material_generation_idx ON knowledge_chunks(material_id, generation_id, chunk_index);
      CREATE INDEX knowledge_chunks_search_idx ON knowledge_chunks USING GIN(search_vector);

      CREATE TABLE knowledge_chunk_embeddings (
        chunk_id TEXT PRIMARY KEY REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        model_identity TEXT NOT NULL,
        embedding vector,
        status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
        error_message TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CHECK (status <> 'ready' OR embedding IS NOT NULL)
      );
      CREATE INDEX knowledge_chunk_embeddings_scope_idx ON knowledge_chunk_embeddings(class_id, model_identity, status);

      CREATE TABLE assistant_configs (
        class_id TEXT PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
        system_prompt TEXT NOT NULL CHECK (length(trim(system_prompt)) > 0),
        guided_solving_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        title TEXT NOT NULL CHECK (length(trim(title)) > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX conversations_owner_idx ON conversations(user_id, class_id, updated_at);

      CREATE TABLE conversation_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'done', 'error')),
        citations_json TEXT NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX conversation_messages_order_idx ON conversation_messages(conversation_id, created_at, id);
    `,
    testSql: `
      CREATE TABLE access_token_sessions (
        jti_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX access_token_sessions_user_idx ON access_token_sessions(user_id);
      CREATE INDEX access_token_sessions_expiry_idx ON access_token_sessions(expires_at);
      CREATE TABLE knowledge_chunks (
        id TEXT PRIMARY KEY, generation_id TEXT NOT NULL,
        knowledge_entry_id TEXT NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
        material_id TEXT NOT NULL, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        strategy TEXT NOT NULL CHECK (strategy IN ('auto', 'separator', 'markdown_heading')),
        chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0), chunk_text TEXT NOT NULL,
        start_offset INTEGER NOT NULL, end_offset INTEGER NOT NULL,
        index_status TEXT NOT NULL CHECK (index_status IN ('pending', 'ready', 'failed')),
        error_message TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (material_id, class_id) REFERENCES materials(id, class_id) ON DELETE CASCADE,
        UNIQUE (knowledge_entry_id, generation_id, chunk_index)
      );
      CREATE INDEX knowledge_chunks_class_status_idx ON knowledge_chunks(class_id, index_status);
      CREATE INDEX knowledge_chunks_material_generation_idx ON knowledge_chunks(material_id, generation_id, chunk_index);
      CREATE TABLE knowledge_chunk_embeddings (
        chunk_id TEXT PRIMARY KEY REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        model_identity TEXT NOT NULL, embedding TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
        error_message TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX knowledge_chunk_embeddings_scope_idx ON knowledge_chunk_embeddings(class_id, model_identity, status);
      CREATE TABLE assistant_configs (
        class_id TEXT PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
        system_prompt TEXT NOT NULL, guided_solving_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        version INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        title TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX conversations_owner_idx ON conversations(user_id, class_id, updated_at);
      CREATE TABLE conversation_messages (
        id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')), content TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'done', 'error')),
        citations_json TEXT NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX conversation_messages_order_idx ON conversation_messages(conversation_id, created_at, id);
    `,
  },
  {
    id: "005_ai_apps_skills_mcp",
    sql: `
      CREATE TABLE prompt_templates (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        description TEXT NOT NULL DEFAULT '',
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (class_id, name),
        UNIQUE (id, class_id)
      );

      CREATE TABLE prompt_template_versions (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        version INTEGER NOT NULL CHECK (version > 0),
        body TEXT NOT NULL CHECK (length(trim(body)) > 0),
        variables_json TEXT NOT NULL DEFAULT '[]',
        created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (template_id, class_id) REFERENCES prompt_templates(id, class_id) ON DELETE CASCADE,
        UNIQUE (template_id, version),
        UNIQUE (id, class_id)
      );
      CREATE INDEX prompt_templates_class_enabled_idx ON prompt_templates(class_id, enabled, name);
      CREATE INDEX prompt_template_versions_template_idx ON prompt_template_versions(template_id, version DESC);

      CREATE TABLE skills (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        skill_key TEXT NOT NULL CHECK (skill_key ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        description TEXT NOT NULL DEFAULT '',
        origin TEXT NOT NULL CHECK (origin IN ('builtin', 'uploaded')),
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (class_id, skill_key),
        UNIQUE (id, class_id)
      );

      CREATE TABLE skill_versions (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        semantic_version TEXT NOT NULL CHECK (semantic_version ~ '^[0-9]+\\.[0-9]+\\.[0-9]+$'),
        skill_type TEXT NOT NULL CHECK (skill_type IN ('instruction', 'server_action')),
        action_name TEXT,
        instruction_body TEXT NOT NULL DEFAULT '',
        options_json TEXT NOT NULL DEFAULT '{}',
        content_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (skill_id, class_id) REFERENCES skills(id, class_id) ON DELETE CASCADE,
        CHECK ((skill_type = 'instruction' AND action_name IS NULL AND length(trim(instruction_body)) > 0)
          OR (skill_type = 'server_action' AND action_name IS NOT NULL)),
        UNIQUE (skill_id, semantic_version),
        UNIQUE (id, class_id)
      );
      CREATE INDEX skills_class_enabled_idx ON skills(class_id, enabled, skill_key);
      CREATE INDEX skill_versions_skill_idx ON skill_versions(skill_id, created_at DESC);

      CREATE TABLE ai_applications (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        app_key TEXT NOT NULL CHECK (app_key ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        description TEXT NOT NULL DEFAULT '',
        prompt_template_version_id TEXT,
        retrieval_mode TEXT NOT NULL CHECK (retrieval_mode IN ('none', 'keyword', 'vector', 'hybrid')),
        retrieval_limit INTEGER NOT NULL DEFAULT 4 CHECK (retrieval_limit BETWEEN 1 AND 10),
        evidence_required BOOLEAN NOT NULL DEFAULT TRUE,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (prompt_template_version_id, class_id)
          REFERENCES prompt_template_versions(id, class_id) ON DELETE RESTRICT,
        UNIQUE (class_id, app_key),
        UNIQUE (id, class_id)
      );
      CREATE INDEX ai_applications_class_enabled_idx ON ai_applications(class_id, enabled, name);

      CREATE TABLE ai_application_skill_bindings (
        application_id TEXT NOT NULL,
        skill_version_id TEXT NOT NULL,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (application_id, skill_version_id),
        FOREIGN KEY (application_id, class_id) REFERENCES ai_applications(id, class_id) ON DELETE CASCADE,
        FOREIGN KEY (skill_version_id, class_id) REFERENCES skill_versions(id, class_id) ON DELETE CASCADE
      );
      CREATE INDEX ai_application_skill_order_idx
        ON ai_application_skill_bindings(application_id, enabled, position, skill_version_id);

      CREATE TABLE mcp_servers (
        id TEXT PRIMARY KEY,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        server_key TEXT NOT NULL CHECK (server_key ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
        display_name TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
        endpoint_url TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        discovery_status TEXT NOT NULL DEFAULT 'pending'
          CHECK (discovery_status IN ('pending', 'ready', 'failed', 'stale')),
        discovery_error TEXT,
        discovered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (class_id, server_key),
        UNIQUE (id, class_id)
      );

      CREATE TABLE mcp_tools (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        tool_name TEXT NOT NULL,
        normalized_name TEXT NOT NULL CHECK (normalized_name ~ '^[a-z0-9_]{3,128}$'),
        description TEXT NOT NULL DEFAULT '',
        input_schema_json TEXT NOT NULL DEFAULT '{}',
        schema_hash TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        discovered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id, class_id) REFERENCES mcp_servers(id, class_id) ON DELETE CASCADE,
        UNIQUE (server_id, tool_name),
        UNIQUE (class_id, normalized_name),
        UNIQUE (id, class_id)
      );
      CREATE INDEX mcp_tools_server_enabled_idx ON mcp_tools(server_id, enabled, tool_name);

      CREATE TABLE ai_application_tool_bindings (
        application_id TEXT NOT NULL,
        tool_id TEXT NOT NULL,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (application_id, tool_id),
        FOREIGN KEY (application_id, class_id) REFERENCES ai_applications(id, class_id) ON DELETE CASCADE,
        FOREIGN KEY (tool_id, class_id) REFERENCES mcp_tools(id, class_id) ON DELETE CASCADE
      );

      ALTER TABLE conversations ADD COLUMN ai_application_id TEXT;
      ALTER TABLE conversations ADD CONSTRAINT conversations_application_class_fk
        FOREIGN KEY (ai_application_id, class_id) REFERENCES ai_applications(id, class_id) ON DELETE RESTRICT;

      CREATE TABLE ai_executions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        application_id TEXT NOT NULL,
        conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
        message_id TEXT REFERENCES conversation_messages(id) ON DELETE SET NULL,
        status TEXT NOT NULL CHECK (status IN ('running', 'done', 'no_hit', 'error', 'cancelled')),
        model_identity TEXT NOT NULL,
        prompt_template_version_id TEXT,
        retrieval_mode TEXT NOT NULL,
        generation_params_json TEXT NOT NULL DEFAULT '{}',
        final_response_preview TEXT,
        error_code TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMPTZ,
        FOREIGN KEY (application_id, class_id) REFERENCES ai_applications(id, class_id) ON DELETE RESTRICT,
        FOREIGN KEY (prompt_template_version_id, class_id)
          REFERENCES prompt_template_versions(id, class_id) ON DELETE SET NULL,
        UNIQUE (id, class_id)
      );
      CREATE INDEX ai_executions_class_started_idx ON ai_executions(class_id, started_at DESC);
      CREATE INDEX ai_executions_user_started_idx ON ai_executions(user_id, started_at DESC);

      CREATE TABLE ai_execution_steps (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        sequence_number INTEGER NOT NULL CHECK (sequence_number >= 0),
        step_type TEXT NOT NULL CHECK (step_type IN (
          'prompt', 'retrieval', 'provider_request', 'provider_response',
          'skill_action', 'mcp_call', 'mcp_result', 'final_answer', 'error'
        )),
        summary TEXT NOT NULL DEFAULT '',
        details_json TEXT NOT NULL DEFAULT '{}',
        duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (execution_id, class_id) REFERENCES ai_executions(id, class_id) ON DELETE CASCADE,
        UNIQUE (execution_id, sequence_number)
      );
      CREATE INDEX ai_execution_steps_execution_idx ON ai_execution_steps(execution_id, sequence_number);
    `,
    testSql: `
      CREATE TABLE prompt_templates (
        id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (class_id, name), UNIQUE (id, class_id)
      );
      CREATE TABLE prompt_template_versions (
        id TEXT PRIMARY KEY, template_id TEXT NOT NULL,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        version INTEGER NOT NULL, body TEXT NOT NULL, variables_json TEXT NOT NULL DEFAULT '[]',
        created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (template_id, class_id) REFERENCES prompt_templates(id, class_id) ON DELETE CASCADE,
        UNIQUE (template_id, version), UNIQUE (id, class_id)
      );
      CREATE INDEX prompt_templates_class_enabled_idx ON prompt_templates(class_id, enabled, name);
      CREATE TABLE skills (
        id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        skill_key TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        origin TEXT NOT NULL CHECK (origin IN ('builtin', 'uploaded')), enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (class_id, skill_key), UNIQUE (id, class_id)
      );
      CREATE TABLE skill_versions (
        id TEXT PRIMARY KEY, skill_id TEXT NOT NULL,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        semantic_version TEXT NOT NULL, skill_type TEXT NOT NULL CHECK (skill_type IN ('instruction', 'server_action')),
        action_name TEXT, instruction_body TEXT NOT NULL DEFAULT '', options_json TEXT NOT NULL DEFAULT '{}',
        content_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (skill_id, class_id) REFERENCES skills(id, class_id) ON DELETE CASCADE,
        UNIQUE (skill_id, semantic_version), UNIQUE (id, class_id)
      );
      CREATE TABLE ai_applications (
        id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        app_key TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        prompt_template_version_id TEXT, retrieval_mode TEXT NOT NULL,
        retrieval_limit INTEGER NOT NULL DEFAULT 4, evidence_required BOOLEAN NOT NULL DEFAULT TRUE,
        enabled BOOLEAN NOT NULL DEFAULT TRUE, created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (prompt_template_version_id, class_id) REFERENCES prompt_template_versions(id, class_id),
        UNIQUE (class_id, app_key), UNIQUE (id, class_id)
      );
      CREATE TABLE ai_application_skill_bindings (
        application_id TEXT NOT NULL, skill_version_id TEXT NOT NULL,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0, enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (application_id, skill_version_id),
        FOREIGN KEY (application_id, class_id) REFERENCES ai_applications(id, class_id) ON DELETE CASCADE,
        FOREIGN KEY (skill_version_id, class_id) REFERENCES skill_versions(id, class_id) ON DELETE CASCADE
      );
      CREATE TABLE mcp_servers (
        id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        server_key TEXT NOT NULL, display_name TEXT NOT NULL, endpoint_url TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE, discovery_status TEXT NOT NULL DEFAULT 'pending',
        discovery_error TEXT, discovered_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (class_id, server_key), UNIQUE (id, class_id)
      );
      CREATE TABLE mcp_tools (
        id TEXT PRIMARY KEY, server_id TEXT NOT NULL,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        tool_name TEXT NOT NULL, normalized_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        input_schema_json TEXT NOT NULL DEFAULT '{}', schema_hash TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE, discovered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (server_id, class_id) REFERENCES mcp_servers(id, class_id) ON DELETE CASCADE,
        UNIQUE (server_id, tool_name), UNIQUE (class_id, normalized_name), UNIQUE (id, class_id)
      );
      CREATE TABLE ai_application_tool_bindings (
        application_id TEXT NOT NULL, tool_id TEXT NOT NULL,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        enabled BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (application_id, tool_id),
        FOREIGN KEY (application_id, class_id) REFERENCES ai_applications(id, class_id) ON DELETE CASCADE,
        FOREIGN KEY (tool_id, class_id) REFERENCES mcp_tools(id, class_id) ON DELETE CASCADE
      );
      ALTER TABLE conversations ADD COLUMN ai_application_id TEXT;
      ALTER TABLE conversations ADD CONSTRAINT conversations_application_class_fk
        FOREIGN KEY (ai_application_id, class_id) REFERENCES ai_applications(id, class_id);
      CREATE TABLE ai_executions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        application_id TEXT NOT NULL, conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
        message_id TEXT REFERENCES conversation_messages(id) ON DELETE SET NULL,
        status TEXT NOT NULL, model_identity TEXT NOT NULL, prompt_template_version_id TEXT,
        retrieval_mode TEXT NOT NULL, generation_params_json TEXT NOT NULL DEFAULT '{}',
        final_response_preview TEXT, error_code TEXT,
        started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TIMESTAMPTZ,
        FOREIGN KEY (application_id, class_id) REFERENCES ai_applications(id, class_id),
        FOREIGN KEY (prompt_template_version_id, class_id) REFERENCES prompt_template_versions(id, class_id),
        UNIQUE (id, class_id)
      );
      CREATE TABLE ai_execution_steps (
        id TEXT PRIMARY KEY, execution_id TEXT NOT NULL,
        class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        sequence_number INTEGER NOT NULL, step_type TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '', details_json TEXT NOT NULL DEFAULT '{}',
        duration_ms INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (execution_id, class_id) REFERENCES ai_executions(id, class_id) ON DELETE CASCADE,
        UNIQUE (execution_id, sequence_number)
      );
    `,
  },
];
