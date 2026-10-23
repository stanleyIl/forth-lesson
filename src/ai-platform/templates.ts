const variablePattern = /\{\{([a-z_][a-z0-9_]*)\}\}/g;

export const ALLOWED_PROMPT_VARIABLES = new Set([
  "application_name",
  "user_role",
  "question",
  "current_date",
  "knowledge_evidence",
  "skill_instructions",
  "conversation_summary",
]);

export function extractTemplateVariables(body: string): string[] {
  const variables = [...body.matchAll(variablePattern)].map((match) => match[1]);
  return [...new Set(variables)].sort();
}

export function validateTemplate(body: string, declaredVariables: string[]): string[] {
  if (!body.trim() || body.length > 12000) throw new Error("Invalid prompt template body");
  const declared = [...new Set(declaredVariables)];
  if (declared.length > 20 || declared.some((item) => !ALLOWED_PROMPT_VARIABLES.has(item))) {
    throw new Error("Invalid prompt template variables");
  }
  const used = extractTemplateVariables(body);
  if (used.some((item) => !declared.includes(item)) || declared.some((item) => !used.includes(item))) {
    throw new Error("Prompt template variables do not match placeholders");
  }
  const malformed = body.replace(variablePattern, "").match(/\{\{|\}\}/);
  if (malformed) throw new Error("Malformed prompt template placeholder");
  return declared.sort();
}

export function renderTemplate(body: string, variables: string[], values: Record<string, string>): string {
  const validated = validateTemplate(body, variables);
  for (const variable of validated) {
    if (!(variable in values)) throw new Error(`Missing prompt variable: ${variable}`);
  }
  return body.replace(variablePattern, (_match, variable: string) => values[variable] ?? "");
}
