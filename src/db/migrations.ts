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
];
