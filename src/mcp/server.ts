import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import * as z from "zod/v4";

import { calculate, lookupClassSchedule } from "./tools.js";

export function createCampusMcpServer(): McpServer {
  const server = new McpServer({ name: "campusclaw-local-tools", version: "1.0.0" });
  server.registerTool("calculate", {
    title: "安全计算器",
    description: "执行有界的加减乘除或乘方运算",
    inputSchema: {
      operation: z.enum(["add", "subtract", "multiply", "divide", "power"]),
      a: z.number().min(-1_000_000).max(1_000_000),
      b: z.number().min(-1_000_000).max(1_000_000),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (input) => ({
    content: [{ type: "text", text: JSON.stringify(calculate(input)) }],
  }));
  server.registerTool("lookup_class_schedule", {
    title: "班级课程表查询",
    description: "查询 A 班或 B 班在指定工作日的演示课程安排",
    inputSchema: {
      classId: z.enum(["class-a", "class-b"]),
      day: z.enum(["monday", "tuesday", "wednesday"]),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async (input) => ({
    content: [{ type: "text", text: JSON.stringify(lookupClassSchedule(input)) }],
  }));
  return server;
}

export function startCampusMcpServer(port = Number(process.env.MCP_PORT ?? 3100)) {
  const app = createMcpExpressApp({
    host: "0.0.0.0",
    allowedHosts: ["mcp-server", "localhost", "127.0.0.1"],
  });
  app.get("/health", (_request: Request, response: Response) => response.status(200).json({ status: "ok", service: "campusclaw-mcp" }));
  app.post("/mcp", async (request: Request, response: Response) => {
    const server = createCampusMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch {
      if (!response.headersSent) {
        response.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      }
    } finally {
      response.on("close", () => {
        void transport.close();
        void server.close();
      });
    }
  });
  app.get("/mcp", (_request: Request, response: Response) => response.status(405).json({
    jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null,
  }));
  app.delete("/mcp", (_request: Request, response: Response) => response.status(405).json({
    jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null,
  }));
  return app.listen(port, "0.0.0.0", () => {
    process.stdout.write(`campusclaw-mcp-ready:${port}\n`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startCampusMcpServer();
}
