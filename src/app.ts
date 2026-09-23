import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";

import { createAuthenticationGuard, requireTeacher } from "./auth.js";
import type { AppConfig } from "./config.js";
import {
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
import { loginPage, materialDetailPage, materialsPage } from "./web/pages.js";
import { HttpEmbeddingProvider, type EmbeddingProvider } from "./retrieval/provider.js";
import { RetrievalService } from "./retrieval/service.js";
import { validateSearchInput } from "./retrieval/validation.js";
import { EmbeddingIndexer } from "./retrieval/indexer.js";

export type BuildAppOptions = {
  config: AppConfig;
  database: Database & TransactionalDatabase;
  logger?: false | typeof safeLoggerOptions;
  materialStorage?: MaterialStorage;
  materialParser?: MaterialParser;
  embeddingProvider?: EmbeddingProvider;
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
  );
  const authenticateBrowser = createAuthenticationGuard(
    sessions,
    options.config,
    "browser",
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
    reply.setCookie(options.config.sessionCookieName, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: options.config.sessionCookieSecure,
      path: "/",
      expires: session.expiresAt,
    });
    return reply.send({
      user: { id: user.id, role: user.role, classId: user.class_id },
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
      return reply.status(201).send({ material: publicMaterial(material) });
    },
  );

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
