import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredFile = {
  storageKey: string;
  absolutePath: string;
};

export interface MaterialStorage {
  write(bytes: Buffer, fileType: "txt" | "md"): Promise<StoredFile>;
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
