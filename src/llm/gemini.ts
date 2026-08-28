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

export interface GeminiConfig {
  apiKey: string;
  model: string;
  baseURL?: string;
}

interface GeminiPart {
  text?: string;

  functionCall?: {
    name: string;
    args?: Record<
      string,
      unknown
    >;
  };

  functionResponse?: {
    name: string;
    response: Record<
      string,
      unknown
    >;
  };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
}

export class GeminiModel
  implements ModelClient
{
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseURL: string;

  constructor(
    config: GeminiConfig,
  ) {
    this.apiKey = config.apiKey;
    this.model = config.model;

    this.baseURL =
      config.baseURL ??
      "https://generativelanguage.googleapis.com/v1beta";
  }

  async chat(params: {
    messages: ContextItem[];
    tools?: ToolDefinition[];
  }): Promise<ModelResponse> {
    const systemInstruction =
      this.getSystemPrompt(
        params.messages,
      );

    const contents =
      this.convertMessages(
        params.messages,
      );

    const body: Record<
      string,
      unknown
    > = {
      contents,
    };

    if (
      systemInstruction.length > 0
    ) {
      body.systemInstruction = {
        parts: [
          {
            text: systemInstruction,
          },
        ],
      };
    }

    if (
      params.tools !== undefined &&
      params.tools.length > 0
    ) {
      body.tools = [
        {
          functionDeclarations:
            this.convertTools(
              params.tools,
            ),
        },
      ];
    }

    console.log(
      "[Gemini] sending request...",
    );

    const response = await fetch(
      `${this.baseURL}/models/${this.model}:generateContent?key=${encodeURIComponent(
        this.apiKey,
      )}`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const error =
        await response.text();

      throw new Error(
        `Gemini API error ${response.status}: ${error}`,
      );
    }

    const data =
      (await response.json()) as GeminiResponse;

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
  ): GeminiContent[] {
    const result: GeminiContent[] =
      [];

    for (const item of messages) {
      if (
        "role" in item &&
        item.role === "user"
      ) {
        result.push({
          role: "user",
          parts: [
            {
              text: item.content,
            },
          ],
        });

        continue;
      }

      if (
        "role" in item &&
        item.role === "assistant"
      ) {
        result.push({
          role: "model",
          parts: [
            {
              text: item.content,
            },
          ],
        });

        continue;
      }

      if (
        "type" in item &&
        item.type === "function_call"
      ) {
        result.push({
          role: "model",
          parts: [
            {
              functionCall: {
                name: item.name,
                args:
                  this.parseArguments(
                    item.arguments,
                  ),
              },
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
        const parsed =
          this.parseToolOutput(
            item.output,
          );

        result.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name:
                  this.getFunctionName(
                    messages,
                    item.call_id,
                  ),
                response: parsed,
              },
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
    parametersJsonSchema: unknown;
  }> {
    return tools.map(
      (tool) => ({
        name: tool.name,
        description:
          tool.description,
        parametersJsonSchema:
          tool.parameters,
      }),
    );
  }

  private parseResponse(
    response: GeminiResponse,
  ): ModelResponse {
    const functionCalls: FunctionCall[] =
      [];

    const textParts: string[] =
      [];

    const parts =
      response.candidates?.[0]
        ?.content?.parts ?? [];

    for (const part of parts) {
      if (
        part.text !== undefined
      ) {
        textParts.push(
          part.text,
        );
      }

      if (
        part.functionCall !==
          undefined
      ) {
        const call =
          part.functionCall;

        const callId =
          `gemini_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2)}`;

        functionCalls.push({
          type: "function_call",
          call_id: callId,
          name: call.name,
          arguments:
            JSON.stringify(
              call.args ?? {},
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

  private parseToolOutput(
    output: string,
  ): Record<
    string,
    unknown
  > {
    try {
      const parsed =
        JSON.parse(output);

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

      return {
        result: parsed,
      };
    } catch {
      return {
        result: output,
      };
    }
  }

  private getFunctionName(
    messages: ContextItem[],
    callId: string,
  ): string {
    for (
      const item of messages
    ) {
      if (
        "type" in item &&
        item.type === "function_call" &&
        item.call_id === callId
      ) {
        return item.name;
      }
    }

    return "unknown_function";
  }
}