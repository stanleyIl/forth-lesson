import { Ajv } from "ajv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type DiscoveredTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const timeout = async <T>(promise: Promise<T>, milliseconds: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("MCP operation timed out")), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export class McpClientService {
  private readonly ajv = new Ajv({ allErrors: true, strict: false });

  constructor(private readonly options: { connectTimeoutMs: number; callTimeoutMs: number; maximumOutputCharacters: number }) {}

  private async connected<T>(endpoint: string, work: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ name: "campusclaw-application", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(endpoint));
    try {
      await timeout(client.connect(transport), this.options.connectTimeoutMs);
      return await work(client);
    } finally {
      await client.close().catch(() => undefined);
    }
  }

  async discover(endpoint: string): Promise<DiscoveredTool[]> {
    return this.connected(endpoint, async (client) => {
      const response = await timeout(client.listTools(), this.options.callTimeoutMs);
      return response.tools.map((tool) => {
        const inputSchema = tool.inputSchema as Record<string, unknown>;
        this.ajv.compile(inputSchema);
        return { name: tool.name, description: tool.description ?? "", inputSchema };
      });
    });
  }

  async call(endpoint: string, name: string, inputSchema: Record<string, unknown>, args: unknown): Promise<string> {
    const validate = this.ajv.compile(inputSchema);
    if (!validate(args)) throw new Error("Invalid MCP tool arguments");
    const result = await this.connected(endpoint, async (client) =>
      timeout(client.callTool({ name, arguments: args as Record<string, unknown> }), this.options.callTimeoutMs));
    if (result.isError) throw new Error("MCP tool failed");
    const content = result.content as Array<{ type: string; text?: string }>;
    const text = content
      .filter((item): item is { type: "text"; text: string } => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n");
    if (!text || text.length > this.options.maximumOutputCharacters) throw new Error("Invalid MCP tool output");
    return text;
  }
}
