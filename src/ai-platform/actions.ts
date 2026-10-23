import { z } from "zod";

export type SkillActionResult = { summary: string; content: string };
export type SkillAction = {
  name: string;
  execute(input: unknown, options: Record<string, unknown>): Promise<SkillActionResult>;
};

const actions = new Map<string, SkillAction>();

actions.set("format-citations", {
  name: "format-citations",
  async execute(input) {
    const parsed = z.object({
      citations: z.array(z.object({ index: z.number().int().positive(), filename: z.string().max(255) })).max(10),
    }).parse(input);
    return {
      summary: `formatted ${parsed.citations.length} citations`,
      content: parsed.citations.map((item) => `[${item.index}] ${item.filename}`).join("\n"),
    };
  },
});

actions.set("extract-key-points", {
  name: "extract-key-points",
  async execute(input, options) {
    const parsed = z.object({ text: z.string().trim().min(1).max(12000) }).parse(input);
    const maximum = z.number().int().min(1).max(8).catch(3).parse(options.maximum);
    const points = parsed.text
      .split(/[。！？\n]+/u)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, maximum);
    return { summary: `extracted ${points.length} key points`, content: points.map((item) => `- ${item}`).join("\n") };
  },
});

export function hasSkillAction(name: string): boolean {
  return actions.has(name);
}

export async function executeSkillAction(
  name: string,
  input: unknown,
  options: Record<string, unknown>,
  maximumOutputChars: number,
): Promise<SkillActionResult> {
  const action = actions.get(name);
  if (!action) throw new Error("Unknown skill action");
  const result = await action.execute(input, options);
  if (result.content.length > maximumOutputChars) throw new Error("Skill action output too large");
  return result;
}
