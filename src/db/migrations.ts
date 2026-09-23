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
];
