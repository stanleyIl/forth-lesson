import { MaterialError } from "./errors.js";

export type MaterialParser = (text: string, fileType: "txt" | "md") => string[];

export const parseMaterialText: MaterialParser = (text) => {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    throw new MaterialError("Parsed content must not be empty", 400);
  }
  return [normalized];
};
