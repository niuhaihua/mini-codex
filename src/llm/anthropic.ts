import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlockParam,
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.js";

import type {
  ContextItem,
  SystemMessage,
} from "../agent/context.js";

import type {
  FunctionCall,
  ModelClient,
  ModelResponse,
  ToolDefinition,
} from "./types.js";

export interface AnthropicConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  timeoutMs?: number;
}

export class AnthropicModel implements ModelClient {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(config: AnthropicConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseURL !== undefined ? { baseURL: config.baseURL } : {}),
      timeout: config.timeoutMs ?? 600000,
    });
    this.model = config.model;
  }

  async chat(params: {
    messages: ContextItem[];
    tools?: ToolDefinition[];
  }): Promise<ModelResponse> {
    const system = this.getSystemPrompt(params.messages);
    const messages = this.convertMessages(params.messages);
    const tools = this.convertTools(params.tools ?? []);

    console.log("[Anthropic] model:", this.model);
    console.log("[Anthropic] messages:", messages.length);
    console.log("[Anthropic] tools:", tools.length);
    console.log("[Anthropic] sending request...");

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8192,
      ...(system.length > 0 ? { system } : {}),
      messages,
      ...(tools.length > 0 ? { tools } : {}),
    });

    return this.parseResponse(response);
  }

  private getSystemPrompt(messages: ContextItem[]): string {
    return messages
      .filter(
        (item): item is SystemMessage =>
          "role" in item && item.role === "system",
      )
      .map((item) => item.content)
      .join("\n\n");
  }

  private convertMessages(messages: ContextItem[]): MessageParam[] {
    const result: MessageParam[] = [];

    const append = (
      role: MessageParam["role"],
      content: ContentBlockParam,
    ): void => {
      const last = result[result.length - 1];
      if (last?.role === role) {
        if (typeof last.content === "string") {
          last.content = [{ type: "text", text: last.content }];
        }
        last.content.push(content);
        return;
      }

      result.push({ role, content: [content] });
    };

    for (const item of messages) {
      if ("role" in item && item.role === "system") {
        continue;
      }
      if ("role" in item && item.role === "user") {
        append("user", {
          type: "text",
          text: item.content,
        });
        continue;
      }
      if ("role" in item && item.role === "assistant") {
        append("assistant", {
          type: "text",
          text: item.content,
        });
        continue;
      }
      if ("type" in item && item.type === "function_call") {
        append("assistant", {
          type: "tool_use",
          id: item.call_id,
          name: item.name,
          input: this.parseArguments(item.arguments),
        });
        continue;
      }
      if ("type" in item && item.type === "function_call_output") {
        append("user", {
          type: "tool_result",
          tool_use_id: item.call_id,
          content: item.output,
        });
      }
    }

    return result;
  }

  private convertTools(tools: ToolDefinition[]): Tool[] {
    return tools.map(
      (tool) =>
        ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.parameters,
        }) as Tool,
    );
  }

  private parseResponse(response: Anthropic.Message): ModelResponse {
    const functionCalls: FunctionCall[] = [];
    const textParts: string[] = [];

    for (const item of response.content) {
      if (item.type === "text") {
        textParts.push(item.text);
      }
      if (item.type === "tool_use") {
        functionCalls.push({
          type: "function_call",
          call_id: item.id,
          name: item.name,
          arguments: JSON.stringify(item.input),
        });
      }
    }

    return {
      content: textParts.length > 0 ? textParts.join("") : null,
      functionCalls,
    };
  }

  private parseArguments(value: string): Record<string, unknown> {
    try {
      const parsed: unknown = JSON.parse(value);
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Keep malformed tool arguments from breaking the next request.
    }
    return {};
  }
}
