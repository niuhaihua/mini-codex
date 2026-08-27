import OpenAI from "openai";

import type {
  ResponseInputItem,
  ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses";

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

/**
 * OpenAI 配置
 */
export interface OpenAIConfig {
  /**
   * API Key
   */
  apiKey: string;

  /**
   * API Base URL
   *
   * 官方：
   *
   * https://api.openai.com/v1
   *
   * 中转站：
   *
   * https://xxx.com/v1
   */
  baseURL?: string;

  /**
   * 模型名称
   */
  model: string;
}

/**
 * OpenAI Responses API Client
 */
export class OpenAIModel
  implements ModelClient
{
  private readonly client: OpenAI;

  private readonly model: string;

  constructor(
    config: OpenAIConfig,
  ) {
    this.client = new OpenAI({
      apiKey:
        config.apiKey,

      ...(config.baseURL !==
      undefined
        ? {
            baseURL:
              config.baseURL,
          }
        : {}),
      timeout: 60000,
    });

    this.model =
      config.model;
  }

  /**
   * 调用 Responses API
   */
async chat(params: {
  messages: ContextItem[];
  tools?: ToolDefinition[];
}): Promise<ModelResponse> {
  console.log("[OpenAI] model:", this.model);

  console.log(
    "[OpenAI] messages:",
    params.messages.length,
  );

  console.log(
    "[OpenAI] tools:",
    params.tools?.length ?? 0,
  );

  console.log("[OpenAI] sending request...");

  const instructions =
    this.getSystemPrompt(
      params.messages,
    );

  const input =
    this.convertMessages(
      params.messages,
    );

  const tools =
    this.convertTools(
      params.tools ?? [],
    );

  const request: ResponseCreateParamsNonStreaming =
    {
      model: this.model,

      ...(instructions.length > 0
        ? {
            instructions,
          }
        : {}),

      input,

      ...(tools.length > 0
        ? {
            tools,
          }
        : {}),
    };

  const response =
    await this.client.responses.create(
      request,
    );

  console.log(
    "[OpenAI] response received",
  );

  console.log(
    "[OpenAI] output items:",
    response.output.length,
  );

  return this.parseResponse(
    response,
  );
}

  /**
   * 获取 System Prompt
   */
  private getSystemPrompt(
    messages: ContextItem[],
  ): string {
    return messages
      .filter(
        (item): item is SystemMessage =>
          "role" in item &&
          item.role === "system",
      )
      .map(
        (item) => item.content,
      )
      .join("\n\n");
  }

  /**
   * 转换 Context
   *
   * 我们自己的 Context：
   *
   * ContextItem[]
   *
   * ↓
   *
   * Responses API：
   *
   * ResponseInputItem[]
   */
  private convertMessages(
    messages: ContextItem[],
  ): ResponseInputItem[] {
    const result: ResponseInputItem[] =
      [];

    for (
      const message of messages
    ) {
      /**
       * System 不放进 input。
       *
       * System Prompt 已经通过
       * instructions 发送。
       */
      if (
        "role" in message &&
        message.role === "system"
      ) {
        continue;
      }

      /**
       * User
       */
      if (
        "role" in message &&
        message.role === "user"
      ) {
        result.push({
          role: "user",

          content:
            message.content,
        });

        continue;
      }

      /**
       * Assistant
       */
      if (
        "role" in message &&
        message.role ===
        "assistant"
      ) {
        result.push({
          role: "assistant",

          content:
            message.content,
        });

        continue;
      }

      /**
       * Function Call
       */
      if (
        message.type ===
        "function_call"
      ) {
        result.push({
          type: "function_call",

          call_id:
            message.call_id,

          name:
            message.name,

          arguments:
            message.arguments,
        });

        continue;
      }

      /**
       * Function Call Output
       */
      if (
        message.type ===
        "function_call_output"
      ) {
        result.push({
          type:
            "function_call_output",

          call_id:
            message.call_id,

          output:
            message.output,
        });
      }
    }

    return result;
  }

  /**
   * 转换 Tool
   */
  private convertTools(
    tools: ToolDefinition[],
  ): NonNullable<
    ResponseCreateParamsNonStreaming["tools"]
  > {
    return tools.map(
      (tool) => ({
        type: "function" as const,

        name: tool.name,

        description: tool.description,

        parameters: tool.parameters,

        strict: tool.strict ?? false,
      }),
    );
  }

  /**
   * 解析 Responses API
   */
  private parseResponse(
    response: OpenAI.Responses.Response,
  ): ModelResponse {
    const functionCalls: FunctionCall[] =
      [];

    /**
     * Responses API 已经提供
     * output_text。
     */
    const content =
      response.output_text ||
      null;

    /**
     * 遍历 output
     *
     * 找 Function Call
     */
    for (
      const item of
        response.output
    ) {
      if (
        item.type ===
        "function_call"
      ) {
        functionCalls.push({
          type:
            "function_call",

          call_id:
            item.call_id,

          name:
            item.name,

          arguments:
            item.arguments,
        });
      }
    }

    return {
      content,

      functionCalls,
    };
  }
}