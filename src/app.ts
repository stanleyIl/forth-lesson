import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { AiApplicationOrchestrator } from "./ai-platform/orchestrator.js";
import {
  AiApplicationRepository,
  ExecutionRepository,
  McpRepository,
  PromptTemplateRepository,
  SkillRepository,
} from "./ai-platform/repositories.js";
import { hasSkillAction } from "./ai-platform/actions.js";
import { parseSkillPackage } from "./ai-platform/skills.js";
import { renderTemplate, validateTemplate } from "./ai-platform/templates.js";
import { createAuthenticationGuard, requireTeacher } from "./auth.js";
import type { AppConfig } from "./config.js";
import {
  AccessTokenSessionRepository,
  KnowledgeEntryRepository,
  MaterialRepository,
  RetrievalRepository,
  SessionRepository,
  UserRepository,
  type Database,
} from "./db/repositories.js";
import { safeLoggerOptions } from "./logging.js";
import { MaterialError } from "./materials/errors.js";
import {
  MaterialIngestionService,
  type TransactionalDatabase,
} from "./materials/ingestion.js";
import {
  parseMaterialText,
  type MaterialParser,
} from "./materials/parser.js";
import {
  FileMaterialStorage,
  type MaterialStorage,
} from "./materials/storage.js";
import { verifyPassword } from "./security/passwords.js";
import { SessionService } from "./security/sessions.js";
import { AccessTokenService, bearerToken } from "./security/tokens.js";
import { loginPage, materialDetailPage, materialsPage } from "./web/pages.js";
import { HttpEmbeddingProvider, type EmbeddingProvider } from "./retrieval/provider.js";
import { RetrievalService } from "./retrieval/service.js";
import { validateSearchInput } from "./retrieval/validation.js";
import { EmbeddingIndexer } from "./retrieval/indexer.js";
import { AssistantConfigRepository, ChunkRepository, ConversationRepository } from "./db/assistant-repositories.js";
import { ChunkIndexer } from "./knowledge/chunk-indexer.js";
import { ChunkSearchService, SearchUnavailableError } from "./knowledge/search.js";
import { HttpChatProvider, ChatProviderError, type ChatProvider } from "./assistant/chat-provider.js";
import { GroundedAnswerService } from "./assistant/grounded-answer.js";
import { McpClientService } from "./mcp/client.js";

export type BuildAppOptions = {
  config: AppConfig;
  database: Database & TransactionalDatabase;
  logger?: false | typeof safeLoggerOptions;
  materialStorage?: MaterialStorage;
  materialParser?: MaterialParser;
  embeddingProvider?: EmbeddingProvider;
  chatProvider?: ChatProvider;
  mcpClient?: McpClientService;
};

const loginSchema = z.object({
  accountIdentifier: z.string().min(1),
  password: z.string().min(1),
});

const dummyPasswordHash =
  "scrypt$16384$8$1$4gvbp8hZpErdxQS9Xv_isA$c4odnhI4PReTa6zRVSEihJOiw38Bd8hqGgUfqrYCIUo";

function publicMaterial(material: Awaited<ReturnType<MaterialRepository["findById"]>> extends infer T ? Exclude<T, null> : never) {
  const { storage_key: _storageKey, ...publicRecord } = material;
  return publicRecord;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? safeLoggerOptions });
  const users = new UserRepository(options.database);
  const sessions = new SessionService(
    new SessionRepository(options.database),
    options.config.sessionSecret,
    options.config.sessionTtlSeconds,
  );
  const accessTokens = new AccessTokenService(
    new AccessTokenSessionRepository(options.database),
    {
      secret: options.config.jwtSecret ?? options.config.sessionSecret,
      issuer: options.config.jwtIssuer ?? "campusclaw",
      audience: options.config.jwtAudience ?? "campusclaw-browser",
      ttlSeconds: options.config.jwtTtlSeconds ?? 3600,
    },
  );
  const materials = new MaterialRepository(options.database);
  const entries = new KnowledgeEntryRepository(options.database);
  const retrievalRepository = new RetrievalRepository(options.database);
  const embeddingProvider = options.embeddingProvider ?? new HttpEmbeddingProvider({
    endpoint: options.config.embeddingEndpoint ?? "http://127.0.0.1:11434/v1/embeddings",
    apiKey: options.config.embeddingApiKey,
    model: options.config.embeddingModel ?? "text-embedding-3-small",
    timeoutMs: options.config.embeddingTimeoutMs ?? 5000,
    batchSize: options.config.embeddingBatchSize ?? 32,
  });
  const retrieval = new RetrievalService(retrievalRepository, embeddingProvider, {
    lexicalCandidates: options.config.searchLexicalCandidates ?? 50,
    vectorCandidates: options.config.searchVectorCandidates ?? 50,
    rrfK: options.config.searchRrfK ?? 60,
    excerptLength: options.config.searchExcerptLength ?? 240,
  });
  const indexer = new EmbeddingIndexer(entries, retrievalRepository, embeddingProvider);
  const chunks = new ChunkRepository(options.database);
  const chunkIndexer = new ChunkIndexer(options.database, chunks, embeddingProvider, {
    maxChars: options.config.chunkMaxChars ?? 800,
    overlapChars: options.config.chunkOverlapChars ?? 80,
  });
  const chunkSearch = new ChunkSearchService(chunks, embeddingProvider, {
    threshold: options.config.vectorSimilarityThreshold ?? 0.35,
    rrfK: options.config.searchRrfK ?? 60,
  });
  const assistantConfigs = new AssistantConfigRepository(options.database);
  const conversations = new ConversationRepository(options.database);
  const promptTemplates = new PromptTemplateRepository(options.database);
  const skills = new SkillRepository(options.database);
  const aiApplications = new AiApplicationRepository(options.database);
  const mcpRepository = new McpRepository(options.database);
  const executionRepository = new ExecutionRepository(
    options.database,
    options.config.executionTracePreviewChars ?? 2000,
  );
  const mcpClient = options.mcpClient ?? new McpClientService({
    connectTimeoutMs: options.config.mcpConnectTimeoutMs ?? 5000,
    callTimeoutMs: options.config.mcpCallTimeoutMs ?? 10000,
    maximumOutputCharacters: options.config.toolMaxOutputChars ?? 8000,
  });
  const chatProvider = options.chatProvider ?? new HttpChatProvider({
    endpoint: options.config.chatEndpoint ?? "http://127.0.0.1:11434/v1/chat/completions",
    apiKey: options.config.chatApiKey,
    model: options.config.chatModel ?? "campusclaw-chat",
    timeoutMs: options.config.chatTimeoutMs ?? 30000,
    maxTokens: options.config.chatMaxTokens ?? 600,
  });
  const groundedAnswers = new GroundedAnswerService(chunkSearch, assistantConfigs, chatProvider, {
    messages: options.config.conversationHistoryMessages ?? 12,
    chars: options.config.conversationHistoryChars ?? 12000,
  });
  const aiOrchestrator = new AiApplicationOrchestrator(
    aiApplications,
    chunkSearch,
    chatProvider,
    mcpClient,
    executionRepository,
    {
      historyMessages: options.config.conversationHistoryMessages ?? 12,
      historyCharacters: options.config.conversationHistoryChars ?? 12000,
      maximumToolRounds: options.config.toolMaxRounds ?? 1,
      maximumToolCalls: options.config.toolMaxCalls ?? 2,
      maximumToolOutputCharacters: options.config.toolMaxOutputChars ?? 8000,
      maximumTokens: options.config.chatMaxTokens ?? 600,
      tracePreviewCharacters: options.config.executionTracePreviewChars ?? 2000,
    },
  );
  const materialStorage = options.materialStorage ??
    new FileMaterialStorage(options.config.materialStorageRoot);
  const ingestion = new MaterialIngestionService(
    options.database,
    materialStorage,
    options.materialParser ?? parseMaterialText,
    options.config.uploadMaxBytes,
  );
  const authenticateApi = createAuthenticationGuard(
    sessions,
    options.config,
    "api",
    accessTokens,
  );
  const authenticateBrowser = createAuthenticationGuard(
    sessions,
    options.config,
    "browser",
    accessTokens,
  );

  void app.register(cookie);
  void app.register(multipart, {
    limits: { files: 1, fileSize: options.config.uploadMaxBytes },
  });

  app.get("/", async (_request, reply) => reply.redirect("/login"));
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/login", async (_request, reply) =>
    reply.type("text/html").send(loginPage()),
  );

  app.post("/api/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }
    const user = await users.findByAccount(parsed.data.accountIdentifier);
    const passwordMatches = await verifyPassword(
      user?.password_hash ?? dummyPasswordHash,
      parsed.data.password,
    );
    if (!user || !passwordMatches) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const session = await sessions.create({
      userId: user.id,
      role: user.role,
      classId: user.class_id,
    });
    const access = await accessTokens.create({ userId: user.id, role: user.role, classId: user.class_id });
    reply.setCookie(options.config.sessionCookieName, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: options.config.sessionCookieSecure,
      path: "/",
      expires: session.expiresAt,
    });
    return reply.send({
      user: { id: user.id, role: user.role, classId: user.class_id },
      accessToken: access.token,
      tokenType: "Bearer",
      expiresAt: access.expiresAt.toISOString(),
    });
  });

  app.get(
    "/app/materials",
    { preHandler: authenticateBrowser },
    async (_request, reply) =>
      reply.type("text/html").send(materialsPage()),
  );

  app.get<{ Params: { materialId: string } }>(
    "/app/materials/:materialId",
    { preHandler: authenticateBrowser },
    async (request, reply) => {
      const material = await materials.findById(request.params.materialId);
      if (!material || material.class_id !== request.sessionIdentity!.classId) {
        return reply.status(404).type("text/html").send("<!doctype html><title>Not Found</title><h1>Not Found</h1>");
      }
      const knowledgeEntries = await entries.listForMaterial(material.id, request.sessionIdentity!.classId);
      return reply.type("text/html").send(materialDetailPage(material, knowledgeEntries));
    },
  );

  app.get(
    "/api/me",
    { preHandler: authenticateApi },
    async (request) => ({ user: request.sessionIdentity }),
  );

  app.get(
    "/api/session",
    { preHandler: authenticateApi },
    async (request) => ({ user: request.sessionIdentity }),
  );

  app.post("/api/logout", async (request, reply) => {
    const token = bearerToken(request.headers.authorization);
    if (token) await accessTokens.revoke(token);
    await sessions.revoke(request.cookies[options.config.sessionCookieName]);
    reply.clearCookie(options.config.sessionCookieName, {
      httpOnly: true,
      sameSite: "lax",
      secure: options.config.sessionCookieSecure,
      path: "/",
    });
    return reply.send({ ok: true });
  });

  app.get(
    "/api/materials",
    { preHandler: authenticateApi },
    async (request) => ({
      materials: (await materials.listForClass(request.sessionIdentity!.classId)).map(publicMaterial),
    }),
  );

  app.get<{ Params: { materialId: string } }>(
    "/api/materials/:materialId",
    { preHandler: authenticateApi },
    async (request, reply) => {
      const material = await materials.findById(request.params.materialId);
      if (!material || material.class_id !== request.sessionIdentity!.classId) {
        return reply.status(404).send({ error: "Not Found" });
      }
      return {
        material: publicMaterial(material),
        knowledgeEntries: await entries.listForMaterial(
          material.id,
          request.sessionIdentity!.classId,
        ),
      };
    },
  );

  app.get<{ Params: { materialId: string } }>(
    "/api/materials/:materialId/file",
    { preHandler: authenticateApi },
    async (request, reply) => {
      const material = await materials.findById(request.params.materialId);
      if (!material || material.class_id !== request.sessionIdentity!.classId) {
        return reply.status(404).send({ error: "Not Found" });
      }
      try {
        const bytes = await materialStorage.read(material.storage_key);
        const fallbackFilename = material.file_type === "md" ? "material.md" : "material.txt";
        const safeFilename = material.original_filename.replace(/[\r\n"]/g, "_") || fallbackFilename;
        return reply
          .type(material.file_type === "md" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8")
          .header("content-disposition", `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`)
          .send(bytes);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return reply.status(404).send({ error: "Not Found" });
        }
        app.log.error({ err: error, operation: "material-download" }, "material download failed");
        return reply.status(503).send({ error: "Material unavailable" });
      }
    },
  );

  app.get<{ Params: { entryId: string } }>(
    "/api/knowledge-entries/:entryId",
    { preHandler: authenticateApi },
    async (request, reply) => {
      const entry = await entries.findById(request.params.entryId);
      if (!entry || entry.class_id !== request.sessionIdentity!.classId) {
        return reply.status(404).send({ error: "Not Found" });
      }
      return { knowledgeEntry: entry };
    },
  );

  app.post(
    "/api/materials",
    { preHandler: [authenticateApi, requireTeacher] },
    async (request, reply) => {
      const upload = await request.file({
        limits: { files: 1, fileSize: options.config.uploadMaxBytes },
      });
      if (!upload) {
        throw new MaterialError("A material file is required", 400);
      }
      const bytes = await upload.toBuffer();
      if (upload.file.truncated) {
        throw new MaterialError("File exceeds upload size limit", 413);
      }
      const material = await ingestion.ingest({
        filename: upload.filename,
        bytes,
        uploaderUserId: request.sessionIdentity!.userId,
        classId: request.sessionIdentity!.classId,
      });
      void indexer.index(request.sessionIdentity!.classId).catch((error) => {
        app.log.warn({ err: error, operation: "embedding-index" }, "embedding index update failed");
      });
      void chunkIndexer.indexMaterial({ materialId: material.id, classId: request.sessionIdentity!.classId }).catch((error) => {
        app.log.warn({ err: error, operation: "chunk-index" }, "chunk index update failed");
      });
      return reply.status(201).send({ material: publicMaterial(material) });
    },
  );

  const searchSchema = z.object({
    q: z.string().trim().min(1).max(options.config.searchMaxQueryLength ?? 1000),
    mode: z.enum(["keyword", "vector", "hybrid"]).default("hybrid"),
    limit: z.number().int().min(1).max(options.config.searchMaxLimit ?? 50).default(options.config.searchDefaultLimit ?? 10),
    offset: z.number().int().min(0).max(1000).default(0),
  });

  app.post<{ Body: unknown }>("/api/search", { preHandler: authenticateApi }, async (request, reply) => {
    const parsed = searchSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid search query" });
    try {
      const result = await chunkSearch.search({ classId: request.sessionIdentity!.classId, ...parsed.data });
      return { mode: result.mode, hits: result.hits.map((hit, index) => ({
        rank: index + 1,
        excerpt: hit.excerpt,
        scores: { combined: hit.fusedScore, lexicalRank: hit.lexicalRank, vectorRank: hit.vectorRank, lexical: hit.lexicalScore, vector: hit.vectorScore },
        source: { materialId: hit.materialId, knowledgeEntryId: hit.knowledgeEntryId, chunkId: hit.chunkId, originalFilename: hit.filename, chunkIndex: hit.chunkIndex, startOffset: hit.startOffset, endOffset: hit.endOffset },
      })) };
    } catch (error) {
      if (error instanceof SearchUnavailableError) return reply.status(503).send({ error: "Search unavailable" });
      throw error;
    }
  });

  const askSchema = z.object({
    q: z.string().trim().min(1).max(options.config.askMaxQuestionLength ?? 2000),
  });
  app.post<{ Body: unknown }>("/api/ask", { preHandler: authenticateApi }, async (request, reply) => {
    const parsed = askSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid question" });
    try { const result = await groundedAnswers.answer({ identity: request.sessionIdentity!, question: parsed.data.q }); return { answer: result.answer, citations: result.citations }; }
    catch (error) { if (error instanceof ChatProviderError || error instanceof SearchUnavailableError) return reply.status(503).send({ error: "Assistant unavailable" }); throw error; }
  });

  app.get("/api/assistant-config", { preHandler: authenticateApi }, async (request) => {
    const config = await assistantConfigs.get(request.sessionIdentity!.classId);
    return { systemPrompt: config.system_prompt, guidedSolvingEnabled: config.guided_solving_enabled, version: config.version, editable: request.sessionIdentity!.role === "teacher" };
  });
  app.patch<{ Body: unknown }>("/api/assistant-config", { preHandler: [authenticateApi, requireTeacher] }, async (request, reply) => {
    const parsed = z.object({ systemPrompt: z.string().trim().min(10).max(4000).optional(), guidedSolvingEnabled: z.boolean().optional() }).refine(value => value.systemPrompt !== undefined || value.guidedSolvingEnabled !== undefined).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid assistant configuration" });
    const updated = await assistantConfigs.update(request.sessionIdentity!.classId, request.sessionIdentity!.userId, { systemPrompt: parsed.data.systemPrompt, guided: parsed.data.guidedSolvingEnabled });
    return { systemPrompt: updated.system_prompt, guidedSolvingEnabled: updated.guided_solving_enabled, version: updated.version };
  });

  app.post<{ Params: { materialId: string }; Body: unknown }>("/api/materials/:materialId/reindex", { preHandler: [authenticateApi, requireTeacher] }, async (request, reply) => {
    const material = await materials.findById(request.params.materialId);
    if (!material || material.class_id !== request.sessionIdentity!.classId) return reply.status(404).send({ error: "Not Found" });
    const parsed = z.object({ strategy: z.enum(["auto", "separator", "markdown_heading"]).default("auto"), separator: z.string().max(20).optional(), maxChars: z.number().int().min(100).max(5000).optional(), overlapChars: z.number().int().min(0).max(1000).optional() }).safeParse(request.body ?? {});
    if (!parsed.success || (parsed.data.maxChars && parsed.data.overlapChars && parsed.data.overlapChars >= parsed.data.maxChars)) return reply.status(400).send({ error: "Invalid chunk strategy" });
    return chunkIndexer.indexMaterial({ materialId: material.id, classId: material.class_id, ...parsed.data });
  });

  const applicationInputSchema = z.object({
    appKey: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/).optional(),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).default(""),
    promptTemplateVersionId: z.string().uuid().or(z.string().regex(/^seed-/)).nullable(),
    retrievalMode: z.enum(["none", "keyword", "vector", "hybrid"]),
    retrievalLimit: z.number().int().min(1).max(10).default(4),
    evidenceRequired: z.boolean().default(true),
    enabled: z.boolean().default(true),
    skillVersionIds: z.array(z.string()).max(20).default([]),
    toolIds: z.array(z.string()).max(20).default([]),
  });

  app.get("/api/ai-applications", { preHandler: authenticateApi }, async (request) => {
    const applications = await aiApplications.list(request.sessionIdentity!.classId, request.sessionIdentity!.role === "teacher");
    return {
      applications,
      ...(request.sessionIdentity!.role === "teacher"
        ? { contexts: await Promise.all(applications.map((application) => aiApplications.context(application.id, request.sessionIdentity!.classId))) }
        : {}),
    };
  });

  app.post<{ Body: unknown }>("/api/ai-applications", { preHandler: [authenticateApi, requireTeacher] }, async (request, reply) => {
    const parsed = applicationInputSchema.required({ appKey: true }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid AI application" });
    if ((await aiApplications.list(request.sessionIdentity!.classId, true)).length >= (options.config.aiApplicationMaxPerClass ?? 20)) {
      return reply.status(400).send({ error: "AI application limit reached" });
    }
    if (parsed.data.promptTemplateVersionId && !await promptTemplates.getVersion(parsed.data.promptTemplateVersionId, request.sessionIdentity!.classId)) {
      return reply.status(400).send({ error: "Invalid prompt template version" });
    }
    try {
      await skills.validateVersionIds(request.sessionIdentity!.classId, parsed.data.skillVersionIds);
      await mcpRepository.validateToolIds(request.sessionIdentity!.classId, parsed.data.toolIds);
      const application = await aiApplications.create(request.sessionIdentity!, {
        appKey: parsed.data.appKey,
        name: parsed.data.name,
        description: parsed.data.description,
        promptTemplateVersionId: parsed.data.promptTemplateVersionId,
        retrievalMode: parsed.data.retrievalMode,
        retrievalLimit: parsed.data.retrievalLimit,
        evidenceRequired: parsed.data.evidenceRequired,
        enabled: parsed.data.enabled,
      });
      await skills.replaceBindings(application!.id, request.sessionIdentity!.classId, parsed.data.skillVersionIds);
      await mcpRepository.replaceBindings(application!.id, request.sessionIdentity!.classId, parsed.data.toolIds);
      return reply.status(201).send({ application: await aiApplications.context(application!.id, request.sessionIdentity!.classId) });
    } catch {
      return reply.status(400).send({ error: "Invalid application bindings" });
    }
  });

  app.patch<{ Params: { applicationId: string }; Body: unknown }>("/api/ai-applications/:applicationId", { preHandler: [authenticateApi, requireTeacher] }, async (request, reply) => {
    const parsed = applicationInputSchema.omit({ appKey: true }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid AI application" });
    if (parsed.data.promptTemplateVersionId && !await promptTemplates.getVersion(parsed.data.promptTemplateVersionId, request.sessionIdentity!.classId)) {
      return reply.status(400).send({ error: "Invalid prompt template version" });
    }
    try {
      await skills.validateVersionIds(request.sessionIdentity!.classId, parsed.data.skillVersionIds);
      await mcpRepository.validateToolIds(request.sessionIdentity!.classId, parsed.data.toolIds);
      const application = await aiApplications.update(request.sessionIdentity!, request.params.applicationId, parsed.data);
      if (!application) return reply.status(404).send({ error: "Not Found" });
      await skills.replaceBindings(application.id, request.sessionIdentity!.classId, parsed.data.skillVersionIds);
      await mcpRepository.replaceBindings(application.id, request.sessionIdentity!.classId, parsed.data.toolIds);
      return { application: await aiApplications.context(application.id, request.sessionIdentity!.classId) };
    } catch {
      return reply.status(400).send({ error: "Invalid application bindings" });
    }
  });

  const templateSchema = z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).default(""),
    body: z.string().trim().min(1).max(12000),
    variables: z.array(z.string()).max(20),
  });
  app.get("/api/prompt-templates", { preHandler: authenticateApi }, async (request) => ({
    templates: await promptTemplates.list(request.sessionIdentity!.classId),
    versions: await promptTemplates.listVersions(request.sessionIdentity!.classId),
  }));
  app.post<{ Body: unknown }>("/api/prompt-templates", { preHandler: [authenticateApi, requireTeacher] }, async (request, reply) => {
    const parsed = templateSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid prompt template" });
    if ((await promptTemplates.list(request.sessionIdentity!.classId)).length >= (options.config.promptTemplateMaxPerClass ?? 50)) {
      return reply.status(400).send({ error: "Prompt template limit reached" });
    }
    try {
      const variables = validateTemplate(parsed.data.body, parsed.data.variables);
      return reply.status(201).send({ template: await promptTemplates.create(request.sessionIdentity!, { ...parsed.data, variables }) });
    } catch {
      return reply.status(400).send({ error: "Invalid prompt template" });
    }
  });
  app.post<{ Params: { templateId: string }; Body: unknown }>("/api/prompt-templates/:templateId/versions", { preHandler: [authenticateApi, requireTeacher] }, async (request, reply) => {
    const parsed = templateSchema.omit({ name: true }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid prompt template" });
    try {
      const variables = validateTemplate(parsed.data.body, parsed.data.variables);
      const version = await promptTemplates.addVersion(request.sessionIdentity!, request.params.templateId, { ...parsed.data, variables });
      return version ? { template: version } : reply.status(404).send({ error: "Not Found" });
    } catch {
      return reply.status(400).send({ error: "Invalid prompt template" });
    }
  });
  app.post<{ Body: unknown }>("/api/prompt-templates/preview", { preHandler: [authenticateApi, requireTeacher] }, async (request, reply) => {
    const parsed = z.object({
      body: z.string().trim().min(1).max(12000),
      variables: z.array(z.string()).max(20),
      values: z.record(z.string(), z.string().max(12000)),
    }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid prompt preview" });
    try {
      return { rendered: renderTemplate(parsed.data.body, parsed.data.variables, parsed.data.values) };
    } catch {
      return reply.status(400).send({ error: "Invalid prompt preview" });
    }
  });
  app.patch<{ Params: { templateId: string }; Body: unknown }>("/api/prompt-templates/:templateId", { preHandler: [authenticateApi, requireTeacher] }, async (request, reply) => {
    const parsed = z.object({ enabled: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid prompt template" });
    return await promptTemplates.setEnabled(request.params.templateId, request.sessionIdentity!.classId, parsed.data.enabled)
      ? { ok: true } : reply.status(404).send({ error: "Not Found" });
  });

  app.get("/api/skills", { preHandler: authenticateApi }, async (request) => ({
    skills: await skills.list(request.sessionIdentity!.classId),
  }));
  app.post("/api/skills/upload", { preHandler: [authenticateApi, requireTeacher] }, async (request, reply) => {
    if ((await skills.list(request.sessionIdentity!.classId)).length >= (options.config.skillMaxPerClass ?? 50)) {
      return reply.status(400).send({ error: "Skill limit reached" });
    }
    const file = await request.file();
    if (!file) return reply.status(400).send({ error: "SKILL.md is required" });
    let parsed;
    let bytes: Buffer;
    try {
      bytes = await file.toBuffer();
      parsed = parseSkillPackage(file.filename, bytes, options.config.skillUploadMaxBytes ?? 131072);
      if (parsed.type === "server_action" && (!parsed.actionName || !hasSkillAction(parsed.actionName))) {
        return reply.status(400).send({ error: "Unknown server action" });
      }
    } catch {
      return reply.status(400).send({ error: "Invalid SKILL.md" });
    }
    const root = options.config.skillStorageRoot ?? path.join(options.config.materialStorageRoot, "skills");
    const directory = path.join(root, request.sessionIdentity!.classId, parsed.skillKey, parsed.semanticVersion);
    const destination = path.join(directory, "SKILL.md");
    const temporaryDirectory = path.join(root, ".tmp", randomUUID());
    const temporaryFile = path.join(temporaryDirectory, "SKILL.md");
    try {
      await mkdir(temporaryDirectory, { recursive: true });
      await writeFile(temporaryFile, bytes, { flag: "wx", mode: 0o600 });
      const result = await skills.createVersion(request.sessionIdentity!, { ...parsed, origin: "uploaded" });
      await mkdir(path.dirname(directory), { recursive: true });
      await rename(temporaryDirectory, directory);
      return reply.status(201).send({ skill: result });
    } catch {
      await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
      return reply.status(400).send({ error: "Skill version already exists or is invalid" });
    }
  });
  app.patch<{ Params: { skillId: string }; Body: unknown }>("/api/skills/:skillId", { preHandler: [authenticateApi, requireTeacher] }, async (request, reply) => {
    const parsed = z.object({ enabled: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid skill" });
    return await skills.setEnabled(request.params.skillId, request.sessionIdentity!.classId, parsed.data.enabled)
      ? { ok: true } : reply.status(404).send({ error: "Not Found" });
  });

  app.get("/api/mcp/servers", { preHandler: [authenticateApi, requireTeacher] }, async (request) => ({
    servers: await mcpRepository.listServers(request.sessionIdentity!.classId),
    tools: await mcpRepository.listTools(request.sessionIdentity!.classId),
  }));
  app.post("/api/mcp/refresh", { preHandler: [authenticateApi, requireTeacher] }, async (request, reply) => {
    const classId = request.sessionIdentity!.classId;
    const serverKey = options.config.mcpServerName ?? "campus-tools";
    const endpoint = options.config.mcpServerUrl ?? "http://127.0.0.1:3100/mcp";
    const serverId = await mcpRepository.ensureServer(classId, serverKey, "CampusClaw 本地工具", endpoint);
    try {
      const discovered = await mcpClient.discover(endpoint);
      await mcpRepository.replaceTools(serverId, classId, serverKey, discovered);
      return { tools: await mcpRepository.listTools(classId) };
    } catch {
      await mcpRepository.markFailure(serverId, classId, "MCP discovery unavailable");
      return reply.status(503).send({ error: "MCP discovery unavailable" });
    }
  });

  app.get("/api/executions", { preHandler: [authenticateApi, requireTeacher] }, async (request) => ({
    executions: await executionRepository.list(request.sessionIdentity!.classId),
  }));
  app.get<{ Params: { executionId: string } }>("/api/executions/:executionId", { preHandler: [authenticateApi, requireTeacher] }, async (request, reply) => {
    const execution = await executionRepository.detail(request.params.executionId, request.sessionIdentity!.classId);
    return execution ? { execution } : reply.status(404).send({ error: "Not Found" });
  });
  app.get<{ Params: { executionId: string } }>("/api/executions/:executionId/export", { preHandler: [authenticateApi, requireTeacher] }, async (request, reply) => {
    const execution = await executionRepository.detail(request.params.executionId, request.sessionIdentity!.classId);
    if (!execution) return reply.status(404).send({ error: "Not Found" });
    const steps = execution.steps as Array<{ step_type: string; summary: string; details: unknown }>;
    const {
      user_id: _userId,
      class_id: _classId,
      conversation_id: _conversationId,
      message_id: _messageId,
      ...safeExecution
    } = execution;
    return {
      repository: "https://github.com/stanleyIl/forth-lesson",
      execution: safeExecution,
      assignmentAnswers: {
        modelRequestAndResponse: steps.filter((step) => step.step_type.startsWith("provider_")),
        promptTemplateIncluded: steps.find((step) => step.step_type === "prompt") ?? null,
        selectedKnowledgeInsteadOfFullDatabase: steps.find((step) => step.step_type === "retrieval") ?? null,
        boundSkillContributionAndExecution: steps.filter((step) => step.step_type === "skill_action" || step.step_type === "prompt"),
        mcpParametersAndResults: steps.filter((step) => step.step_type === "mcp_call" || step.step_type === "mcp_result"),
      },
    };
  });
  app.post("/api/executions/cleanup", { preHandler: [authenticateApi, requireTeacher] }, async (request) => {
    await executionRepository.cleanup(
      request.sessionIdentity!.classId,
      options.config.executionTraceRetentionDays ?? 30,
      options.config.executionTraceMaxPerClass ?? 500,
    );
    return { ok: true };
  });

  app.post<{ Params: { applicationId: string }; Body: unknown }>("/api/ai-applications/:applicationId/ask", { preHandler: authenticateApi }, async (request, reply) => {
    const parsed = z.object({ q: z.string().trim().min(1).max(options.config.askMaxQuestionLength ?? 2000) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid question" });
    try {
      const result = await aiOrchestrator.answer({
        identity: request.sessionIdentity!,
        applicationId: request.params.applicationId,
        question: parsed.data.q,
      });
      return result ? result : reply.status(404).send({ error: "Not Found" });
    } catch {
      return reply.status(503).send({ error: "Assistant unavailable" });
    }
  });

  app.get("/api/conversations", { preHandler: authenticateApi }, async (request) => ({ conversations: await conversations.list(request.sessionIdentity!) }));
  app.post<{ Body: unknown }>("/api/conversations", { preHandler: authenticateApi }, async (request, reply) => {
    const parsed = z.object({ title: z.string().trim().min(1).max(120).default("新对话"), applicationId: z.string().optional() }).safeParse(request.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "Invalid conversation" });
    const application = parsed.data.applicationId
      ? await aiApplications.find(parsed.data.applicationId, request.sessionIdentity!.classId)
      : await aiApplications.findByKey(request.sessionIdentity!.classId, "class-knowledge-assistant");
    if (parsed.data.applicationId && !application) return reply.status(404).send({ error: "Not Found" });
    return reply.status(201).send({ conversation: await conversations.create(request.sessionIdentity!, parsed.data.title, application?.id) });
  });
  app.get<{ Params: { conversationId: string } }>("/api/conversations/:conversationId", { preHandler: authenticateApi }, async (request, reply) => {
    const conversation = await conversations.find(request.params.conversationId, request.sessionIdentity!);
    if (!conversation) return reply.status(404).send({ error: "Not Found" });
    return { conversation, messages: await conversations.messages(conversation.id) };
  });
  app.post<{ Params: { conversationId: string }; Body: unknown }>("/api/conversations/:conversationId/stream", { preHandler: authenticateApi }, async (request, reply) => {
    const conversation = await conversations.find(request.params.conversationId, request.sessionIdentity!);
    if (!conversation) return reply.status(404).send({ error: "Not Found" });
    const parsed = z.object({ q: z.string().trim().min(1).max(options.config.askMaxQuestionLength ?? 2000) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid question" });
    const prior = await conversations.messages(conversation.id);
    await conversations.addMessage(conversation.id, "user", parsed.data.q, "done");
    const assistantMessageId = await conversations.addMessage(conversation.id, "assistant", "", "pending");
    const controller = new AbortController();
    request.raw.on("aborted", () => controller.abort());
    reply.raw.on("close", () => { if (!reply.raw.writableEnded) controller.abort(); });
    reply.hijack(); reply.raw.statusCode = 200; reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8"); reply.raw.setHeader("cache-control", "no-cache"); reply.raw.setHeader("connection", "keep-alive");
    const emit = (event: string, data: unknown) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    emit("meta", { conversationId: conversation.id, messageId: assistantMessageId });
    try {
      const history = prior.filter((item: any) => item.status === "done").map((item: any) => ({ role: item.role, content: item.content }));
      const answer = conversation.ai_application_id
        ? await aiOrchestrator.answer({
            identity: request.sessionIdentity!,
            applicationId: conversation.ai_application_id,
            question: parsed.data.q,
            history,
            conversationId: conversation.id,
            messageId: assistantMessageId,
            emit: (event, data) => emit(event, data),
            signal: controller.signal,
          })
        : await groundedAnswers.answer({ identity: request.sessionIdentity!, question: parsed.data.q, history });
      if (!answer) throw new Error("Application not found");
      for (const citation of answer.citations) emit("citation", citation);
      for (const delta of answer.answer.match(/.{1,24}/gs) ?? [answer.answer]) { emit("delta", { text: delta }); }
      await conversations.completeMessage(assistantMessageId, answer.answer, "done", answer.citations); emit("done", { messageId: assistantMessageId, executionId: "executionId" in answer ? answer.executionId : undefined });
    } catch { await conversations.completeMessage(assistantMessageId, "", "error"); emit("error", { error: "Assistant unavailable" }); }
    reply.raw.end();
  });

  app.post<{ Body: unknown }>(
    "/api/knowledge-search",
    { preHandler: authenticateApi },
    async (request, reply) => {
      let input: ReturnType<typeof validateSearchInput>;
      try {
        input = validateSearchInput(request.body, options.config.searchMaxQueryLength ?? 1000, options.config.searchDefaultLimit ?? 10, options.config.searchMaxLimit ?? 50);
      } catch {
        return reply.status(400).send({ error: "Invalid search query" });
      }
      try {
        return await retrieval.search({ classId: request.sessionIdentity!.classId, query: input.query, limit: input.limit });
      } catch (error) {
        app.log.error({ err: error, operation: "knowledge-search" }, "retrieval failed");
        return reply.status(503).send({ error: "Retrieval unavailable" });
      }
    },
  );

  app.setErrorHandler((error, _request, reply) => {
    if (
      error instanceof MaterialError ||
      (error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE"
    ) {
      const statusCode =
        error instanceof MaterialError ? error.statusCode : 413;
      const message =
        error instanceof Error ? error.message : "File exceeds upload size limit";
      return void reply.status(statusCode).send({ error: message });
    }
    if (error instanceof Error && error.message.includes("relation") && error.message.includes("knowledge_entry_embeddings")) {
      return void reply.status(503).send({ error: "Retrieval unavailable" });
    }
    app.log.error({ err: error }, "request failed");
    void reply.status(500).send({ error: "Internal Server Error" });
  });

  return app;
}
