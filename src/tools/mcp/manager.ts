import type { ToolArguments, ToolExecutor } from "../../agent/agent.js";
import type { ToolDefinition } from "../../llm/types.js";
import type { McpToolProvider } from "./types.js";

export interface McpServerRegistration {
  name: string;
  provider: McpToolProvider;
}

export class McpClientManager implements ToolExecutor {
  private readonly providers = new Map<string, McpToolProvider>();
  private readonly toolProviders = new Map<string, McpToolProvider>();

  registerServer(registration: McpServerRegistration): void {
    if (this.providers.has(registration.name)) {
      throw new Error(`Duplicate MCP server: ${registration.name}`);
    }

    this.providers.set(registration.name, registration.provider);

    for (const definition of registration.provider.getToolDefinitions()) {
      if (this.toolProviders.has(definition.name)) {
        throw new Error(`Duplicate MCP tool: ${definition.name}`);
      }
      this.toolProviders.set(definition.name, registration.provider);
    }
  }

  getToolDefinitions(): ToolDefinition[] {
    return [...this.toolProviders.keys()].map((name) => {
      const provider = this.toolProviders.get(name);
      const definition = provider
        ?.getToolDefinitions()
        .find((tool) => tool.name === name);

      if (!definition) {
        throw new Error(`MCP tool definition not found: ${name}`);
      }

      return definition;
    });
  }

  hasTool(name: string): boolean {
    return this.toolProviders.has(name);
  }

  execute(name: string, args: ToolArguments): Promise<string> {
    const provider = this.toolProviders.get(name);
    if (!provider) {
      throw new Error(`Unknown MCP tool: ${name}`);
    }
    return provider.execute(name, args);
  }

  async close(): Promise<void> {
    await Promise.all(
      [...this.providers.values()].map((provider) => provider.close()),
    );
  }
}
