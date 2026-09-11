import {
  Client,
  StreamableHTTPClientTransport,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/client";
import {
  StdioClientTransport,
  type StdioServerParameters,
} from "@modelcontextprotocol/client/stdio";

import type { ToolArguments } from "../../agent/agent.js";
import type { JsonSchema, ToolDefinition } from "../../llm/types.js";
import type { McpToolProvider } from "./types.js";

export interface GitHubMcpConfig {
  transport: "http" | "stdio";
  url: string;
  token?: string;
  /** Comma-separated remote tool names. Defaults to read-only search tools. */
  tools?: string[];
  command?: string;
  args?: string[];
  cwd?: string;
}

const TOOL_PREFIX = "mcp_github_";
const DEFAULT_TOOLS = [
  "search_repositories",
  "search_code",
  "search_issues",
  "get_repository",
];

export function createGitHubMcpConfigFromEnv(): GitHubMcpConfig | undefined {
  if (process.env.MCP_GITHUB_ENABLED?.toLowerCase() !== "true") {
    return undefined;
  }

  const transport =
    process.env.MCP_GITHUB_TRANSPORT?.toLowerCase() === "stdio"
      ? "stdio"
      : "http";

  return {
    transport,
    url:
      process.env.MCP_GITHUB_URL ??
      "https://api.githubcopilot.com/mcp/",
    ...(process.env.GITHUB_PERSONAL_ACCESS_TOKEN
      ? {
          token: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
        }
      : {}),
    ...(process.env.MCP_GITHUB_TOOLS
      ? {
          tools: parseToolNames(process.env.MCP_GITHUB_TOOLS),
        }
      : {}),
    ...(process.env.MCP_GITHUB_COMMAND
      ? {
          command: process.env.MCP_GITHUB_COMMAND,
        }
      : {}),
    ...(process.env.MCP_GITHUB_ARGS
      ? {
          args: parseArgs(process.env.MCP_GITHUB_ARGS),
        }
      : {}),
    ...(process.env.MCP_GITHUB_CWD
      ? {
          cwd: process.env.MCP_GITHUB_CWD,
        }
      : {}),
  };
}

function parseToolNames(value: string): string[] {
  const names = value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  if (names.length === 0) {
    throw new Error("MCP_GITHUB_TOOLS must contain at least one tool name.");
  }

  return names;
}

function parseArgs(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => typeof item !== "string")
  ) {
    throw new Error("MCP_GITHUB_ARGS must be a JSON string array.");
  }
  return parsed;
}

function toJsonSchema(value: unknown): JsonSchema {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    // Remote schemas can contain long, arbitrary prose. Keep the structural
    // contract while avoiding unnecessary text in the model request.
    return stripSchemaDescriptions(value as JsonSchema);
  }

  return {
    type: "object",
    properties: {},
  };
}

function stripSchemaDescriptions(schema: JsonSchema): JsonSchema {
  const result: JsonSchema = {};

  for (const [key, value] of Object.entries(schema)) {
    if (key === "description") {
      continue;
    }

    if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === "object" && !Array.isArray(item)
          ? stripSchemaDescriptions(item as JsonSchema)
          : item,
      );
    } else if (value !== null && typeof value === "object") {
      result[key] = stripSchemaDescriptions(value as JsonSchema);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function stringifyCallResult(result: CallToolResult): string {
  const text = result.content
    .filter((item): item is { type: "text"; text: string } => item.type === "text")
    .map((item) => item.text)
    .join("\n");

  const payload: Record<string, unknown> = {
    success: !result.isError,
    ...(text ? { output: text } : {}),
    ...(result.structuredContent !== undefined
      ? { structuredContent: result.structuredContent }
      : {}),
  };

  if (result.isError) {
    payload.error = text || "GitHub MCP tool failed.";
  }

  return JSON.stringify(payload);
}

export class GitHubMcpClient implements McpToolProvider {
  private readonly client: Client;
  private readonly config: GitHubMcpConfig;
  private readonly toolNames = new Map<string, string>();
  private definitions: ToolDefinition[] = [];
  private connected = false;

  constructor(config: GitHubMcpConfig) {
    this.config = config;
    this.client = new Client(
      {
        name: "mini-codex",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    if (this.config.transport === "http") {
      if (!this.config.token) {
        throw new Error(
          "GITHUB_PERSONAL_ACCESS_TOKEN is required for the GitHub MCP HTTP transport.",
        );
      }

      const transport = new StreamableHTTPClientTransport(
        new URL(this.config.url),
        {
          authProvider: {
            token: async () => this.config.token,
          },
        },
      );

      await this.client.connect(transport);
    } else {
      if (!this.config.command) {
        throw new Error(
          "MCP_GITHUB_COMMAND is required for the GitHub MCP stdio transport.",
        );
      }

      const server: StdioServerParameters = {
        command: this.config.command,
        ...(this.config.args ? { args: this.config.args } : {}),
        ...(this.config.cwd ? { cwd: this.config.cwd } : {}),
        env: Object.fromEntries(
          Object.entries({
            ...process.env,
            ...(this.config.token
              ? {
                  GITHUB_PERSONAL_ACCESS_TOKEN: this.config.token,
                }
              : {}),
          }).filter(
            (entry): entry is [string, string] =>
              typeof entry[1] === "string",
          ),
        ),
      };

      await this.client.connect(new StdioClientTransport(server));
    }

    const result = await this.client.listTools();
    const allowedTools = new Set(this.config.tools ?? DEFAULT_TOOLS);
    const tools = result.tools.filter((tool) => allowedTools.has(tool.name));
    this.definitions = tools.map((tool) => this.registerTool(tool));
    this.connected = true;

    console.log(
      `[MCP] GitHub connected: ${this.definitions.length} of ${result.tools.length} tools available.`,
    );
  }

  getToolDefinitions(): ToolDefinition[] {
    return this.definitions;
  }

  async execute(name: string, args: ToolArguments): Promise<string> {
    const remoteName = this.toolNames.get(name);
    if (!remoteName) {
      throw new Error(`Unknown GitHub MCP tool: ${name}`);
    }

    const result = await this.client.callTool({
      name: remoteName,
      arguments: args,
    });

    return stringifyCallResult(result);
  }

  async close(): Promise<void> {
    if (!this.connected) {
      return;
    }

    await this.client.close();
    this.connected = false;
  }

  private registerTool(tool: Tool): ToolDefinition {
    const exposedName = `${TOOL_PREFIX}${tool.name}`;
    this.toolNames.set(exposedName, tool.name);

    return {
      type: "function",
      name: exposedName,
      description: `[GitHub MCP] ${tool.name}`,
      parameters: toJsonSchema(tool.inputSchema),
    };
  }
}
