import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";

import { createAuthenticationGuard, requireTeacher } from "./auth.js";
import type { AppConfig } from "./config.js";
import {
  KnowledgeEntryRepository,
  MaterialRepository,
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
import { loginPage, materialsPage } from "./web/pages.js";

export type BuildAppOptions = {
  config: AppConfig;
  database: Database & TransactionalDatabase;
  logger?: false | typeof safeLoggerOptions;
  materialStorage?: MaterialStorage;
  materialParser?: MaterialParser;
};

const loginSchema = z.object({
  accountIdentifier: z.string().min(1),
  password: z.string().min(1),
});

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
  const ingestion = new MaterialIngestionService(
    options.database,
    options.materialStorage ??
      new FileMaterialStorage(options.config.materialStorageRoot),
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

  app.get("/", async () => ({ service: "campusclaw" }));
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
    if (
      !user ||
      !(await verifyPassword(user.password_hash, parsed.data.password))
    ) {
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

  app.get(
    "/api/session",
    { preHandler: authenticateApi },
    async (request) => ({ user: request.sessionIdentity }),
  );

  app.get(
    "/api/materials",
    { preHandler: authenticateApi },
    async (request) => ({
      materials: await materials.listForClass(request.sessionIdentity!.classId),
    }),
  );

  app.get<{ Params: { materialId: string } }>(
    "/api/materials/:materialId",
    { preHandler: authenticateApi },
    async (request, reply) => {
      const material = await materials.findForClass(
        request.params.materialId,
        request.sessionIdentity!.classId,
      );
      if (!material) {
        return reply.status(404).send({ error: "Not Found" });
      }
      return {
        material,
        knowledgeEntries: await entries.listForMaterial(
          material.id,
          request.sessionIdentity!.classId,
        ),
      };
    },
  );

  app.get<{ Params: { entryId: string } }>(
    "/api/knowledge-entries/:entryId",
    { preHandler: authenticateApi },
    async (request, reply) => {
      const entry = await entries.findForClass(
        request.params.entryId,
        request.sessionIdentity!.classId,
      );
      if (!entry) {
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
      return reply.status(201).send({ material });
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
    app.log.error({ err: error }, "request failed");
    void reply.status(500).send({ error: "Internal Server Error" });
  });

  return app;
}
