import { createHash } from "node:crypto";

import { parse as parseYaml } from "yaml";
import { z } from "zod";

import type { SkillType } from "./types.js";

const frontmatterSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  name: z.string().trim().min(1).max(120),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  type: z.enum(["instruction", "server_action"]),
  description: z.string().trim().max(500).default(""),
  action: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/).optional(),
  options: z.record(z.string(), z.unknown()).default({}),
});

export type ParsedSkillPackage = {
  skillKey: string;
  name: string;
  semanticVersion: string;
  type: SkillType;
  description: string;
  actionName?: string;
  options: Record<string, unknown>;
  instructionBody: string;
  contentHash: string;
};

export function parseSkillPackage(filename: string, bytes: Buffer, maximumBytes: number): ParsedSkillPackage {
  if (filename !== "SKILL.md") throw new Error("Skill package filename must be SKILL.md");
  if (!bytes.length || bytes.length > maximumBytes) throw new Error("Invalid skill package size");
  const text = bytes.toString("utf8");
  if (Buffer.from(text, "utf8").compare(bytes) !== 0 || text.includes("\u0000")) {
    throw new Error("Skill package must be UTF-8 text");
  }
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)|<script|```(?:js|javascript|ts|typescript|sh|bash|python)|child_process|process\.env|https?:\/\//i.test(text)) {
    throw new Error("Skill package contains forbidden executable or path content");
  }
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/u.exec(text);
  if (!match) throw new Error("Skill package requires YAML frontmatter");
  const metadata = frontmatterSchema.parse(parseYaml(match[1]));
  const body = match[2].trim();
  if (metadata.type === "instruction" && (!body || body.length > 12000 || metadata.action)) {
    throw new Error("Instruction skill requires bounded Markdown body");
  }
  if (metadata.type === "server_action" && (!metadata.action || body.length > 4000)) {
    throw new Error("Server action skill requires registered action name");
  }
  return {
    skillKey: metadata.id,
    name: metadata.name,
    semanticVersion: metadata.version,
    type: metadata.type,
    description: metadata.description,
    actionName: metadata.action,
    options: metadata.options,
    instructionBody: body,
    contentHash: createHash("sha256").update(bytes).digest("hex"),
  };
}
