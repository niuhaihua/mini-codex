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
}

interface AnthropicResponse {
  content?: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
}

export class AnthropicModel
  implements ModelClient
{
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseURL: string;

  constructor(
    config: AnthropicConfig,
  ) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseURL =
      config.baseURL ??
      "https://api.anthropic.com";
  }

  async chat(params: {
    messages: ContextItem[];
    tools?: ToolDefinition[];
  }): Promise<ModelResponse> {
    const system =
      this.getSystemPrompt(
        params.messages,
      );

    const messages =
      this.convertMessages(
        params.messages,
      );

    const tools =
      this.convertTools(
        params.tools ?? [],
      );

    const body: Record<
      string,
      unknown
    > = {
      model: this.model,
      max_tokens: 8192,
      messages,
    };

    if (system.length > 0) {
      body.system = system;
    }

    if (tools.length > 0) {
      body.tools = tools;
    }

    console.log(
      "[Anthropic] sending request...",
    );

    const response = await fetch(
      `${this.baseURL}/v1/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version":
            "2023-06-01",
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const error =
        await response.text();

      throw new Error(
        `Anthropic API error ${response.status}: ${error}`,
      );
    }

    const data =
      (await response.json()) as AnthropicResponse;

    return this.parseResponse(data);
  }

  private getSystemPrompt(
    messages: ContextItem[],
  ): string {
    return messages
      .filter(
        (
          item,
        ): item is SystemMessage =>
          "role" in item &&
          item.role === "system",
      )
      .map(
        (item) => item.content,
      )
      .join("\n\n");
  }

  private convertMessages(
    messages: ContextItem[],
  ): Array<{
    role: "user" | "assistant";
    content: unknown;
  }> {
    const result: Array<{
      role: "user" | "assistant";
      content: unknown;
    }> = [];

    for (const item of messages) {
      if (
        "role" in item &&
        item.role === "user"
      ) {
        result.push({
          role: "user",
          content: item.content,
        });

        continue;
      }

      if (
        "role" in item &&
        item.role === "assistant"
      ) {
        result.push({
          role: "assistant",
          content: item.content,
        });

        continue;
      }

      if (
        "type" in item &&
        item.type === "function_call"
      ) {
        result.push({
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: item.call_id,
              name: item.name,
              input: this.parseArguments(
                item.arguments,
              ),
            },
          ],
        });

        continue;
      }

      if (
        "type" in item &&
        item.type ===
          "function_call_output"
      ) {
        result.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id:
                item.call_id,
              content: item.output,
            },
          ],
        });
      }
    }

    return result;
  }

  private convertTools(
    tools: ToolDefinition[],
  ): Array<{
    name: string;
    description: string;
    input_schema: unknown;
  }> {
    return tools.map(
      (tool) => ({
        name: tool.name,
        description:
          tool.description,
        input_schema:
          tool.parameters,
      }),
    );
  }

  private parseResponse(
    response: AnthropicResponse,
  ): ModelResponse {
    const functionCalls: FunctionCall[] =
      [];

    const textParts: string[] =
      [];

    for (
      const item of
        response.content ?? []
    ) {
      if (
        item.type === "text" &&
        item.text !== undefined
      ) {
        textParts.push(
          item.text,
        );
      }

      if (
        item.type === "tool_use" &&
        item.id !== undefined &&
        item.name !== undefined
      ) {
        functionCalls.push({
          type: "function_call",
          call_id: item.id,
          name: item.name,
          arguments:
            JSON.stringify(
              item.input ?? {},
            ),
        });
      }
    }

    return {
      content:
        textParts.length > 0
          ? textParts.join("")
          : null,

      functionCalls,
    };
  }

  private parseArguments(
    value: string,
  ): Record<
    string,
    unknown
  > {
    try {
      const parsed =
        JSON.parse(value);

      if (
        parsed !== null &&
        typeof parsed ===
          "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<
          string,
          unknown
        >;
      }
    } catch {
      // ignore
    }

    return {};
  }
}