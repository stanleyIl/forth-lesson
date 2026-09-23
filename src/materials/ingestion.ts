import type { PoolClient } from "pg";

import {
  KnowledgeEntryRepository,
  MaterialRepository,
  type MaterialRecord,
} from "../db/repositories.js";
import type { MaterialParser } from "./parser.js";
import type { MaterialStorage, StoredFile } from "./storage.js";
import { validateMaterial } from "./validation.js";

export type TransactionalDatabase = {
  connect(): Promise<PoolClient>;
};

export class MaterialIngestionService {
  constructor(
    private readonly database: TransactionalDatabase,
    private readonly storage: MaterialStorage,
    private readonly parser: MaterialParser,
    private readonly maxBytes: number,
  ) {}

  async ingest(input: {
    filename: string;
    bytes: Buffer;
    uploaderUserId: string;
    classId: string;
  }): Promise<MaterialRecord> {
    const validated = validateMaterial({
      filename: input.filename,
      bytes: input.bytes,
      maxBytes: this.maxBytes,
    });

    let stored: StoredFile | undefined;
    let client: PoolClient | undefined;
    try {
      stored = await this.storage.write(
        validated.bytes,
        validated.fileType,
      );
      const contents = this.parser(validated.text, validated.fileType);
      client = await this.database.connect();
      await client.query("BEGIN");
      const materials = new MaterialRepository(client);
      const entries = new KnowledgeEntryRepository(client);
      const material = await materials.create({
        uploaderUserId: input.uploaderUserId,
        classId: input.classId,
        originalFilename: validated.originalFilename,
        storageKey: stored.storageKey,
        fileType: validated.fileType,
        sizeBytes: validated.bytes.length,
      });
      await entries.createMany(material.id, input.classId, contents);
      await client.query("COMMIT");
      return material;
    } catch (error) {
      if (client) {
        await client.query("ROLLBACK");
      }
      if (stored) {
        await this.storage.removeOrQuarantine(stored);
      }
      throw error;
    } finally {
      client?.release();
    }
  }
}
