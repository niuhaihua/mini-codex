import type { ToolDefinition } from "../../llm/types.js";
import type { ToolArguments } from "../../agent/agent.js";

export interface McpToolProvider {
  getToolDefinitions(): ToolDefinition[];
  execute(name: string, args: ToolArguments): Promise<string>;
  close(): Promise<void>;
}
