import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import type { ChatProvider } from "../src/assistant/chat-provider.js";
import { seedAccounts, seedCourseData } from "../src/db/seed.js";
import type { McpClientService } from "../src/mcp/client.js";
import { createTestDatabase } from "./helpers/database.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function multipartPayload(filename: string, content: Buffer) {
  const boundary = "----campusclaw-skill-boundary";
  return {
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/markdown\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

async function setup() {
  const database = await createTestDatabase();
  const root = await mkdtemp(path.join(os.tmpdir(), "campusclaw-ai-api-"));
  roots.push(root);
  await seedAccounts(database, [
    { accountIdentifier: "teacher-a", password: "password", role: "teacher", classId: "class-a", className: "Class A" },
    { accountIdentifier: "student-a", password: "password", role: "student", classId: "class-a", className: "Class A" },
    { accountIdentifier: "teacher-b", password: "password", role: "teacher", classId: "class-b", className: "Class B" },
  ]);
  await seedCourseData(database, path.join(root, "materials"), { mcpEndpoint: "http://mock-mcp/mcp" });

  const completeWithTools = vi.fn<ChatProvider["completeWithTools"]>(async (messages, tools) => {
    const toolMessage = [...messages].reverse().find((message) => message.role === "tool");
    if (toolMessage) return { content: `工具结果是 ${toolMessage.content}`, finishReason: "stop", toolCalls: [] };
    const calculate = tools.find((tool) => tool.function.name.endsWith("__calculate"));
    if (calculate) {
      return {
        content: "",
        finishReason: "tool_calls",
        toolCalls: [{ id: "call-calc", name: calculate.function.name, arguments: JSON.stringify({ operation: "multiply", a: 6, b: 7 }) }],
      };
    }
    return { content: "普通回答", finishReason: "stop", toolCalls: [] };
  });
  const chatProvider: ChatProvider = {
    model: "mock-tool-model",
    complete: async () => "普通回答",
    completeWithTools,
  };
  const mcpClient = {
    discover: vi.fn(async () => [
      {
        name: "calculate",
        description: "safe calculator",
        inputSchema: {
          type: "object",
          properties: {
            operation: { type: "string", enum: ["multiply"] },
            a: { type: "number" },
            b: { type: "number" },
          },
          required: ["operation", "a", "b"],
          additionalProperties: false,
        },
      },
      {
        name: "lookup_class_schedule",
        description: "schedule",
        inputSchema: {
          type: "object",
          properties: { classId: { type: "string" }, day: { type: "string" } },
          required: ["classId", "day"],
        },
      },
    ]),
    call: vi.fn(async (_endpoint: string, name: string) =>
      name === "calculate" ? JSON.stringify({ expression: "6 × 7", result: 42 }) : "[]"),
  } as unknown as McpClientService;
  const config = {
    nodeEnv: "test" as const,
    host: "127.0.0.1",
    port: 3000,
    databaseUrl: "postgresql://unused",
    sessionSecret: "test-session-secret-at-least-32-characters",
    sessionTtlSeconds: 3600,
    sessionCookieName: "campusclaw_session",
    sessionCookieSecure: false,
    uploadMaxBytes: 1024 * 1024,
    materialStorageRoot: path.join(root, "materials"),
    embeddingEndpoint: "http://embed",
    embeddingModel: "embed",
    embeddingTimeoutMs: 100,
    embeddingBatchSize: 10,
    searchMaxQueryLength: 1000,
    searchDefaultLimit: 10,
    searchMaxLimit: 50,
    searchLexicalCandidates: 50,
    searchVectorCandidates: 50,
    searchExcerptLength: 240,
    searchRrfK: 60,
    jwtSecret: "test-jwt-secret-at-least-32-characters",
    jwtIssuer: "campusclaw",
    jwtAudience: "campusclaw-browser",
    jwtTtlSeconds: 3600,
    chatEndpoint: "http://chat",
    chatModel: "chat",
    chatTimeoutMs: 100,
    chatMaxTokens: 300,
    askMaxQuestionLength: 1000,
    conversationHistoryMessages: 12,
    conversationHistoryChars: 12000,
    chunkMaxChars: 100,
    chunkOverlapChars: 10,
    vectorSimilarityThreshold: 0.35,
    skillStorageRoot: path.join(root, "skills"),
    skillUploadMaxBytes: 100_000,
    mcpServerName: "campus-tools",
    mcpServerUrl: "http://mock-mcp/mcp",
  };
  const app = buildApp({
    config,
    database,
    logger: false,
    embeddingProvider: {
      model: "embed",
      embedQuery: async () => [1],
      embedDocuments: async (texts) => texts.map(() => [1]),
    },
    chatProvider,
    mcpClient,
  });
  await app.ready();
  const login = async (accountIdentifier: string) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { accountIdentifier, password: "password" },
    });
    return response.json().accessToken as string;
  };
  return {
    app,
    database,
    completeWithTools,
    mcpClient,
    teacher: await login("teacher-a"),
    student: await login("student-a"),
    teacherB: await login("teacher-b"),
  };
}

describe("lesson-six AI platform APIs", () => {
  it("lists multiple same-class applications and protects teacher management", async () => {
    const context = await setup();
    const list = await context.app.inject({
      url: "/api/ai-applications",
      headers: { authorization: `Bearer ${context.student}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().applications).toHaveLength(2);
    expect(JSON.stringify(list.json())).not.toContain("class-b");

    expect((await context.app.inject({
      method: "POST",
      url: "/api/prompt-templates",
      headers: { authorization: `Bearer ${context.student}` },
      payload: { name: "forbidden", description: "", body: "{{question}}", variables: ["question"] },
    })).statusCode).toBe(403);

    expect((await context.app.inject({
      method: "GET",
      url: "/api/executions",
      headers: { authorization: `Bearer ${context.student}` },
    })).statusCode).toBe(403);
    const page = await context.app.inject({
      url: "/app/materials",
      headers: { authorization: `Bearer ${context.teacher}` },
    });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("第 6 课 AI 平台管理");
    expect(page.body).toContain("Skill 注册表");
    expect(page.body).toContain("MCP 工具");
    expect(page.body).toContain("执行证据");
    expect(page.body).toContain("sessionStorage");
    expect(page.body).toContain("Authorization");
    expect(page.body).not.toContain("http://mock-mcp/mcp");
    expect(page.body).not.toContain(context.teacher);
    await context.app.close();
    await context.database.end();
  });

  it("previews and versions templates without a model call", async () => {
    const context = await setup();
    const preview = await context.app.inject({
      method: "POST",
      url: "/api/prompt-templates/preview",
      headers: { authorization: `Bearer ${context.teacher}` },
      payload: { body: "应用：{{application_name}}，问题：{{question}}", variables: ["application_name", "question"], values: { application_name: "测试", question: "MCP 是什么" } },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().rendered).toContain("MCP 是什么");
    expect(context.completeWithTools).not.toHaveBeenCalled();
    const created = await context.app.inject({
      method: "POST",
      url: "/api/prompt-templates",
      headers: { authorization: `Bearer ${context.teacher}` },
      payload: { name: "新模板", description: "", body: "{{question}}", variables: ["question"] },
    });
    expect(created.statusCode, created.body).toBe(201);
    const version = await context.app.inject({
      method: "POST",
      url: `/api/prompt-templates/${created.json().template.templateId}/versions`,
      headers: { authorization: `Bearer ${context.teacher}` },
      payload: { description: "v2", body: "问题：{{question}}", variables: ["question"] },
    });
    expect(version.statusCode).toBe(200);
    expect(version.json().template.version).toBe(2);
    await context.app.close();
    await context.database.end();
  });

  it("uploads a declarative SKILL.md and rejects student upload", async () => {
    const context = await setup();
    const skill = Buffer.from(`---
id: evidence-summary
name: 证据摘要
version: 1.0.0
type: instruction
description: 只总结选中的证据
---
只使用当前应用选中的知识片段。`);
    const upload = multipartPayload("SKILL.md", skill);
    expect((await context.app.inject({
      method: "POST",
      url: "/api/skills/upload",
      headers: { ...upload.headers, authorization: `Bearer ${context.student}` },
      payload: upload.payload,
    })).statusCode).toBe(403);
    const teacherUpload = await context.app.inject({
      method: "POST",
      url: "/api/skills/upload",
      headers: { ...upload.headers, authorization: `Bearer ${context.teacher}` },
      payload: upload.payload,
    });
    expect(teacherUpload.statusCode, teacherUpload.body).toBe(201);
    const list = await context.app.inject({
      url: "/api/skills",
      headers: { authorization: `Bearer ${context.teacher}` },
    });
    expect(JSON.stringify(list.json())).toContain("evidence-summary");
    await context.app.close();
    await context.database.end();
  });

  it("discovers MCP tools, binds one application, executes a tool loop and exports evidence", async () => {
    const context = await setup();
    const refresh = await context.app.inject({
      method: "POST",
      url: "/api/mcp/refresh",
      headers: { authorization: `Bearer ${context.teacher}` },
    });
    expect(refresh.statusCode).toBe(200);
    expect(refresh.json().tools).toHaveLength(2);
    const calculate = refresh.json().tools.find((tool: { tool_name: string }) => tool.tool_name === "calculate");

    const applications = (await context.app.inject({
      url: "/api/ai-applications",
      headers: { authorization: `Bearer ${context.teacher}` },
    })).json().applications;
    const formula = applications.find((application: { appKey: string }) => application.appKey === "formula-tutor");
    const skillResponse = await context.app.inject({
      url: "/api/skills",
      headers: { authorization: `Bearer ${context.teacher}` },
    });
    expect(skillResponse.statusCode, skillResponse.body).toBe(200);
    const skills = skillResponse.json().skills;
    const keyPoints = skills.find((skill: { skill_key: string }) => skill.skill_key === "extract-key-points");
    const updated = await context.app.inject({
      method: "PATCH",
      url: `/api/ai-applications/${formula.id}`,
      headers: { authorization: `Bearer ${context.teacher}` },
      payload: {
        name: formula.name,
        description: formula.description,
        promptTemplateVersionId: formula.promptTemplateVersionId,
        retrievalMode: "none",
        retrievalLimit: 4,
        evidenceRequired: false,
        enabled: true,
        skillVersionIds: [keyPoints.version_id],
        toolIds: [calculate.id],
        classId: "class-b",
      },
    });
    expect(updated.statusCode).toBe(200);
    expect((await context.app.inject({
      method: "POST",
      url: "/api/mcp/refresh",
      headers: { authorization: `Bearer ${context.teacher}` },
    })).statusCode).toBe(200);

    const answer = await context.app.inject({
      method: "POST",
      url: `/api/ai-applications/${formula.id}/ask`,
      headers: { authorization: `Bearer ${context.teacher}` },
      payload: { q: "请计算 6*7", tool: "foreign", classId: "class-b" },
    });
    expect(answer.statusCode).toBe(200);
    expect(answer.json().answer).toContain("42");
    expect(context.mcpClient.call).toHaveBeenCalledTimes(1);
    expect(context.completeWithTools).toHaveBeenCalledTimes(2);

    const executions = await context.app.inject({
      url: "/api/executions",
      headers: { authorization: `Bearer ${context.teacher}` },
    });
    const executionId = executions.json().executions[0].id;
    const exported = await context.app.inject({
      url: `/api/executions/${executionId}/export`,
      headers: { authorization: `Bearer ${context.teacher}` },
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().assignmentAnswers.mcpParametersAndResults.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(exported.json())).not.toContain("password");
    expect((await context.app.inject({
      url: `/api/executions/${executionId}`,
      headers: { authorization: `Bearer ${context.teacherB}` },
    })).statusCode).toBe(404);
    await context.app.close();
    await context.database.end();
  });
});
