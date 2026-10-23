import { describe, expect, it, vi } from "vitest";

import { executeSkillAction } from "../src/ai-platform/actions.js";
import { AiApplicationOrchestrator, ExecutionCancelledError } from "../src/ai-platform/orchestrator.js";
import {
  AiApplicationRepository,
  ExecutionRepository,
  PromptTemplateRepository,
  SkillRepository,
} from "../src/ai-platform/repositories.js";
import { parseSkillPackage } from "../src/ai-platform/skills.js";
import { extractTemplateVariables, renderTemplate, validateTemplate } from "../src/ai-platform/templates.js";
import { seedAccounts, seedCourseData } from "../src/db/seed.js";
import { calculate, lookupClassSchedule } from "../src/mcp/tools.js";
import { createTestDatabase } from "./helpers/database.js";

describe("prompt templates", () => {
  it("validates declared variables and renders trusted values", () => {
    const body = "你是{{application_name}}，问题：{{question}}";
    expect(extractTemplateVariables(body)).toEqual(["application_name", "question"]);
    expect(validateTemplate(body, ["question", "application_name"])).toEqual(["application_name", "question"]);
    expect(renderTemplate(body, ["application_name", "question"], {
      application_name: "知识助手",
      question: "什么是 MCP？",
    })).toContain("知识助手");
  });

  it("rejects undeclared, unsupported and malformed variables", () => {
    expect(() => validateTemplate("{{question}} {{secret}}", ["question"])).toThrow();
    expect(() => validateTemplate("{{unknown}}", ["unknown"])).toThrow();
    expect(() => validateTemplate("{{question", ["question"])).toThrow();
  });
});

describe("skill packages and actions", () => {
  it("parses an instruction SKILL.md and rejects executable content", () => {
    const valid = Buffer.from(`---
id: evidence-summary
name: 证据摘要
version: 1.0.0
type: instruction
description: 总结证据
---
只总结当前应用选中的知识片段。`);
    expect(parseSkillPackage("SKILL.md", valid, 10_000)).toMatchObject({
      skillKey: "evidence-summary",
      semanticVersion: "1.0.0",
      type: "instruction",
    });
    expect(() => parseSkillPackage("plugin.zip", valid, 10_000)).toThrow();
    expect(() => parseSkillPackage("SKILL.md", Buffer.from(`---
id: bad-skill
name: bad
version: 1.0.0
type: instruction
---
\`\`\`javascript
process.env.SECRET
\`\`\``), 10_000)).toThrow();
  });

  it("executes only registered bounded server actions", async () => {
    await expect(executeSkillAction("extract-key-points", { text: "第一点。第二点。第三点。" }, { maximum: 2 }, 1000))
      .resolves.toMatchObject({ summary: "extracted 2 key points" });
    await expect(executeSkillAction("unknown", {}, {}, 1000)).rejects.toThrow("Unknown skill action");
  });
});

describe("seeded AI applications and repositories", () => {
  it("seeds multiple applications, templates and built-in skills idempotently", async () => {
    const database = await createTestDatabase();
    await seedAccounts(database, [
      { accountIdentifier: "teacher-a", password: "teacher", role: "teacher", classId: "class-a", className: "Class A" },
      { accountIdentifier: "student-a", password: "student", role: "student", classId: "class-a", className: "Class A" },
      { accountIdentifier: "teacher-b", password: "teacher", role: "teacher", classId: "class-b", className: "Class B" },
      { accountIdentifier: "student-b", password: "student", role: "student", classId: "class-b", className: "Class B" },
    ]);
    await seedCourseData(database, "/tmp/campusclaw-ai-seed");
    await seedCourseData(database, "/tmp/campusclaw-ai-seed");
    const applications = await new AiApplicationRepository(database).list("class-a", true);
    expect(applications.map((item) => item.appKey).sort()).toEqual(["class-knowledge-assistant", "formula-tutor"]);
    expect((await database.query("SELECT count(*)::int AS count FROM prompt_template_versions WHERE class_id='class-a'")).rows[0].count).toBe(2);
    expect((await database.query("SELECT count(*)::int AS count FROM skill_versions WHERE class_id='class-a'")).rows[0].count).toBe(2);
    const knowledge = applications.find((item) => item.appKey === "class-knowledge-assistant")!;
    const context = await new AiApplicationRepository(database).context(knowledge.id, "class-a");
    expect(context?.prompt?.variables).toContain("knowledge_evidence");
    expect(context?.prompt?.body).toContain("本班课程解题助手");
    expect(context?.skills[0].skillKey).toBe("guided-solving");
    await database.end();
  });

  it("creates versioned templates and class-safe skill bindings", async () => {
    const database = await createTestDatabase();
    await seedAccounts(database, [
      { accountIdentifier: "teacher-a", password: "teacher", role: "teacher", classId: "class-a", className: "Class A" },
      { accountIdentifier: "teacher-b", password: "teacher", role: "teacher", classId: "class-b", className: "Class B" },
    ]);
    const teacherA = (await database.query("SELECT id FROM users WHERE account_identifier='teacher-a'")).rows[0];
    const teacherB = (await database.query("SELECT id FROM users WHERE account_identifier='teacher-b'")).rows[0];
    const templates = new PromptTemplateRepository(database);
    const created = await templates.create({ userId: teacherA.id, role: "teacher", classId: "class-a" }, {
      name: "测试模板",
      description: "",
      body: "{{question}}",
      variables: ["question"],
    });
    expect(created?.version).toBe(1);
    expect((await templates.addVersion({ userId: teacherA.id, role: "teacher", classId: "class-a" }, created!.templateId, {
      body: "问题：{{question}}",
      variables: ["question"],
    }))?.version).toBe(2);
    const skillRepository = new SkillRepository(database);
    const local = await skillRepository.createVersion(
      { userId: teacherA.id, role: "teacher", classId: "class-a" },
      {
        skillKey: "local-skill",
        name: "A skill",
        description: "",
        origin: "uploaded",
        semanticVersion: "1.0.0",
        type: "instruction",
        instructionBody: "A only",
        options: {},
        contentHash: "local-hash",
      },
    );
    const foreign = await skillRepository.createVersion(
      { userId: teacherB.id, role: "teacher", classId: "class-b" },
      {
        skillKey: "foreign-skill",
        name: "B skill",
        description: "",
        origin: "uploaded",
        semanticVersion: "1.0.0",
        type: "instruction",
        instructionBody: "B only",
        options: {},
        contentHash: "hash",
      },
    );
    const app = await new AiApplicationRepository(database).create(
      { userId: teacherA.id, role: "teacher", classId: "class-a" },
      {
        appKey: "test-app",
        name: "Test",
        description: "",
        promptTemplateVersionId: created!.id,
        retrievalMode: "none",
        retrievalLimit: 4,
        evidenceRequired: false,
      },
    );
    await skillRepository.replaceBindings(app!.id, "class-a", [local.versionId]);
    await expect(skillRepository.replaceBindings(app!.id, "class-a", [foreign.versionId])).rejects.toThrow();
    expect((await new AiApplicationRepository(database).context(app!.id, "class-a"))?.skills.map((item) => item.skillKey)).toEqual(["local-skill"]);
    await database.end();
  });
});

describe("MCP tool implementations", () => {
  it("calculates bounded operations", () => {
    expect(calculate({ operation: "multiply", a: 6, b: 7 })).toEqual({ expression: "6 × 7", result: 42 });
    expect(() => calculate({ operation: "divide", a: 1, b: 0 })).toThrow();
    expect(() => calculate({ operation: "power", a: 1_000_000, b: 1_000_000 })).toThrow();
  });

  it("returns deterministic class schedules", () => {
    expect(lookupClassSchedule({ classId: "class-a", day: "monday" }).lessons).toContain("09:00 小学科学");
    expect(() => lookupClassSchedule({ classId: "class-c", day: "monday" })).toThrow();
  });
});

describe("application execution cancellation", () => {
  it("marks a cancelled execution and starts no provider or tool work", async () => {
    const database = await createTestDatabase();
    await seedAccounts(database, [
      { accountIdentifier: "teacher-a", password: "teacher", role: "teacher", classId: "class-a", className: "Class A" },
      { accountIdentifier: "teacher-b", password: "teacher", role: "teacher", classId: "class-b", className: "Class B" },
    ]);
    await seedCourseData(database, "/tmp/campusclaw-ai-cancel");
    const user = (await database.query("SELECT id FROM users WHERE account_identifier='teacher-a'")).rows[0];
    const application = await new AiApplicationRepository(database).findByKey("class-a", "formula-tutor");
    const completeWithTools = vi.fn();
    const mcpCall = vi.fn();
    const orchestrator = new AiApplicationOrchestrator(
      new AiApplicationRepository(database),
      { search: vi.fn() } as never,
      { model: "test", complete: vi.fn(), completeWithTools } as never,
      { call: mcpCall } as never,
      new ExecutionRepository(database, 1000),
      {
        historyMessages: 10,
        historyCharacters: 1000,
        maximumToolRounds: 1,
        maximumToolCalls: 2,
        maximumToolOutputCharacters: 1000,
        maximumTokens: 300,
        tracePreviewCharacters: 1000,
      },
    );
    const controller = new AbortController();
    controller.abort();
    await expect(orchestrator.answer({
      identity: { userId: user.id, role: "teacher", classId: "class-a" },
      applicationId: application!.id,
      question: "6*7",
      signal: controller.signal,
    })).rejects.toBeInstanceOf(ExecutionCancelledError);
    expect(completeWithTools).not.toHaveBeenCalled();
    expect(mcpCall).not.toHaveBeenCalled();
    expect((await database.query("SELECT status FROM ai_executions")).rows).toEqual([{ status: "cancelled" }]);
    await database.end();
  });
});
