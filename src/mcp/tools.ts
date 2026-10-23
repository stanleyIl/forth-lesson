import { z } from "zod";

const calculationSchema = z.object({
  operation: z.enum(["add", "subtract", "multiply", "divide", "power"]),
  a: z.number().finite().min(-1_000_000).max(1_000_000),
  b: z.number().finite().min(-1_000_000).max(1_000_000),
});

export function calculate(input: unknown): { expression: string; result: number } {
  const parsed = calculationSchema.parse(input);
  let result: number;
  if (parsed.operation === "add") result = parsed.a + parsed.b;
  else if (parsed.operation === "subtract") result = parsed.a - parsed.b;
  else if (parsed.operation === "multiply") result = parsed.a * parsed.b;
  else if (parsed.operation === "divide") {
    if (parsed.b === 0) throw new Error("Division by zero");
    result = parsed.a / parsed.b;
  } else result = parsed.a ** parsed.b;
  if (!Number.isFinite(result) || Math.abs(result) > 1e15) throw new Error("Calculation result out of range");
  const symbol = { add: "+", subtract: "-", multiply: "×", divide: "÷", power: "^" }[parsed.operation];
  return { expression: `${parsed.a} ${symbol} ${parsed.b}`, result };
}

const schedules: Record<string, Record<string, string[]>> = {
  "class-a": {
    monday: ["09:00 小学科学", "14:00 DevOps 实践"],
    tuesday: ["10:00 数学", "15:00 知识库实验"],
    wednesday: ["09:30 AI 应用开发"],
  },
  "class-b": {
    monday: ["10:00 数学", "15:00 阅读"],
    tuesday: ["09:00 小学科学", "14:30 DevOps 实践"],
    wednesday: ["10:30 AI 应用开发"],
  },
};

const scheduleSchema = z.object({
  classId: z.enum(["class-a", "class-b"]),
  day: z.enum(["monday", "tuesday", "wednesday"]),
});

export function lookupClassSchedule(input: unknown): { classId: string; day: string; lessons: string[] } {
  const parsed = scheduleSchema.parse(input);
  return { classId: parsed.classId, day: parsed.day, lessons: schedules[parsed.classId][parsed.day] ?? [] };
}
