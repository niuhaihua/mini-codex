import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions/completions";

import type { ContextItem } from "../agent/context.js";

import type {
  FunctionCall,
  ModelClient,
  ModelResponse,
  ToolDefinition,
} from "./types.js";

export interface GeminiConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
  timeoutMs?: number;
}

/**
 * Gemini-compatible model client using the OpenAI Chat Completions API.
 *
 * The provider name remains "gemini" so existing CLI configuration keeps
 * working, while the endpoint must implement /chat/completions.
 */
export class GeminiModel implements ModelClient {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: GeminiConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.baseURL !== undefined
        ? {
            baseURL: config.baseURL.replace(/\/+$/, ""),
          }
        : {}),
      timeout: config.timeoutMs ?? 600000,
    });
    this.model = config.model;
  }

  async chat(params: {
    messages: ContextItem[];
    tools?: ToolDefinition[];
  }): Promise<ModelResponse> {
    const messages = this.convertMessages(params.messages);
    const tools = this.convertTools(params.tools ?? []);

    const request: ChatCompletionCreateParamsNonStreaming = {
      model: this.model,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
    };

    console.log("[Gemini/OpenAI] model:", this.model);
    console.log(
      "[Gemini/OpenAI] messages:",
      messages.length,
    );
    console.log(
      "[Gemini/OpenAI] tools:",
      tools.length,
    );
    console.log(
      "[Gemini/OpenAI] sending chat.completions.create request...",
    );

    const response =
      await this.client.chat.completions.create(
        request,
      );

    return this.parseResponse(response);
  }

  private convertMessages(
    messages: ContextItem[],
  ): ChatCompletionMessageParam[] {
    const result: ChatCompletionMessageParam[] =
      [];

    for (const item of messages) {
      if ("role" in item) {
        result.push({
          role: item.role,
          content: item.content,
        });
        continue;
      }

      if (item.type === "function_call") {
        result.push({
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: item.call_id,
              type: "function",
              function: {
                name: item.name,
                arguments: item.arguments,
              },
            },
          ],
        });
        continue;
      }

      result.push({
        role: "tool",
        tool_call_id: item.call_id,
        content: item.output,
      });
    }

    return result;
  }

  private convertTools(
    tools: ToolDefinition[],
  ): ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        ...(tool.strict !== undefined
          ? { strict: tool.strict }
          : {}),
      },
    }));
  }

  private parseResponse(
    response: OpenAI.Chat.Completions.ChatCompletion,
  ): ModelResponse {
    const message = response.choices[0]?.message;
    const functionCalls: FunctionCall[] = [];

    for (const toolCall of message?.tool_calls ?? []) {
      if (toolCall.type !== "function") {
        continue;
      }

      functionCalls.push({
        type: "function_call",
        call_id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      });
    }

    return {
      content:
        typeof message?.content === "string"
          ? message.content
          : null,
      functionCalls,
    };
  }
}
