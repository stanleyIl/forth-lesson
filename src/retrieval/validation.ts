import { z } from "zod";
export function validateSearchInput(input: unknown, maxQueryLength: number, defaultLimit: number, maxLimit: number) {
  return z.object({ query: z.string().trim().min(1).max(maxQueryLength), limit: z.number().int().positive().max(maxLimit).optional().default(defaultLimit) }).parse(input);
}
