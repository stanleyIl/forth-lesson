import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredFile = {
  storageKey: string;
  absolutePath: string;
};

export interface MaterialStorage {
  write(bytes: Buffer, fileType: "txt" | "md"): Promise<StoredFile>;
  read(storageKey: string): Promise<Buffer>;
  removeOrQuarantine(stored: StoredFile): Promise<void>;
}

export class FileMaterialStorage implements MaterialStorage {
  constructor(private readonly root: string) {}

  async write(bytes: Buffer, fileType: "txt" | "md"): Promise<StoredFile> {
    await mkdir(this.root, { recursive: true });
    const storageKey = `${randomUUID()}.${fileType}`;
    const absolutePath = path.join(this.root, storageKey);
    await writeFile(absolutePath, bytes, { flag: "wx", mode: 0o600 });
    return { storageKey, absolutePath };
  }

  async read(storageKey: string): Promise<Buffer> {
    if (!/^[A-Za-z0-9-]+\.(txt|md)$/.test(storageKey)) {
      const error = new Error("Stored material not found") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    }
    const absolutePath = path.resolve(this.root, storageKey);
    const rootPath = path.resolve(this.root);
    if (path.dirname(absolutePath) !== rootPath) {
      const error = new Error("Stored material not found") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    }
    return readFile(absolutePath);
  }

  async removeOrQuarantine(stored: StoredFile): Promise<void> {
    try {
      await unlink(stored.absolutePath);
    } catch {
      const quarantineRoot = path.join(this.root, ".quarantine");
      await mkdir(quarantineRoot, { recursive: true });
      await rename(
        stored.absolutePath,
        path.join(quarantineRoot, `${stored.storageKey}.unusable`),
      );
    }
  }
}
