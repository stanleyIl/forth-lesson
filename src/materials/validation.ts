import path from "node:path";

import { MaterialError } from "./errors.js";

export type ValidatedMaterial = {
  originalFilename: string;
  fileType: "txt" | "md";
  bytes: Buffer;
  text: string;
};

export function validateMaterial(input: {
  filename: string;
  bytes: Buffer;
  maxBytes: number;
}): ValidatedMaterial {
  const extension = path.extname(input.filename).toLowerCase();
  if (extension !== ".txt" && extension !== ".md") {
    throw new MaterialError("Unsupported file type", 415);
  }
  if (input.bytes.length === 0) {
    throw new MaterialError("File must not be empty", 400);
  }
  if (input.bytes.length > input.maxBytes) {
    throw new MaterialError("File exceeds upload size limit", 413);
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(input.bytes);
  } catch {
    throw new MaterialError("File must contain valid UTF-8 text", 400);
  }

  return {
    originalFilename: input.filename,
    fileType: extension.slice(1) as "txt" | "md",
    bytes: input.bytes,
    text,
  };
}
