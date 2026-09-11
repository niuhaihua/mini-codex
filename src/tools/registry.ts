import type { ToolArguments, ToolExecutor } from "../agent/agent.js";
import type { ToolDefinition } from "../llm/types.js";
import type { McpClientManager } from "./mcp/manager.js";
import type { ToolFunction } from "./native/tool.js";

export type NativeToolCategory = "file" | "git" | "shell";

export interface NativeToolset {
  category: NativeToolCategory;
  definitions: ToolDefinition[];
  functions: Record<string, ToolFunction>;
}

export class ToolRegistry implements ToolExecutor {
  private readonly definitionsByName = new Map<string, ToolDefinition>();
  private readonly functionsByName = new Map<string, ToolFunction>();
  private mcpManager: McpClientManager | undefined;

  registerNativeTools(toolset: NativeToolset): void {
    for (const definition of toolset.definitions) {
      this.registerDefinition(definition);
    }

    for (const [name, tool] of Object.entries(toolset.functions)) {
      this.registerFunction(name, tool);
    }
  }

  registerMcpManager(manager: McpClientManager): void {
    this.mcpManager = manager;

    for (const definition of manager.getToolDefinitions()) {
      this.registerDefinition(definition);
    }
  }

  getDefinitions(): ToolDefinition[] {
    return [...this.definitionsByName.values()];
  }

  async execute(name: string, args: ToolArguments): Promise<string> {
    const nativeTool = this.functionsByName.get(name);
    if (nativeTool) {
      return nativeTool(args);
    }

    if (this.mcpManager?.hasTool(name)) {
      return this.mcpManager.execute(name, args);
    }

    throw new Error(`Unknown registered tool: ${name}`);
  }

  private registerDefinition(definition: ToolDefinition): void {
    if (this.definitionsByName.has(definition.name)) {
      throw new Error(`Duplicate tool definition: ${definition.name}`);
    }

    this.definitionsByName.set(definition.name, definition);
  }

  private registerFunction(name: string, tool: ToolFunction): void {
    if (this.functionsByName.has(name)) {
      throw new Error(`Duplicate native tool function: ${name}`);
    }

    this.functionsByName.set(name, tool);
  }
}
