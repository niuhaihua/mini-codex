import OpenAI from "openai";

import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions/completions";

import type {
  ResponseInputItem,
  ResponseCreateParamsBase,
  ResponseCreateParamsNonStreaming,
  ResponseStreamEvent,
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

type OpenAIResponseRequest =
  Omit<ResponseCreateParamsBase, "stream">;

type OpenAIChatRequest =
  Omit<
    ChatCompletionCreateParamsNonStreaming,
    "stream"
  >;

class EmptyResponseStreamError extends Error {}

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

  timeoutMs?: number;
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
      timeout: config.timeoutMs ?? 600000,
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
    onToken?: (token: string) => void;
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

    const request: OpenAIResponseRequest = {
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
    // console.log(
    //   "[OpenAI] request sent",
    //   request
    // );
    if (params.onToken) {
      let didEmitText = false;
      try {
        return await this.createStreamingResponse(
          request,
          (token) => {
            if (!token) return;
            didEmitText = true;
            params.onToken?.(token);
          },
        );
      } catch (error: unknown) {
        // Retrying after visible output would duplicate or mix answers.
        if (didEmitText || !(
          error instanceof EmptyResponseStreamError ||
          (error instanceof OpenAI.APIError &&
            [404, 405, 501].includes(error.status ?? 0))
        )) {
          throw error;
        }
        console.warn(
          "[OpenAI] Responses stream failed, falling back to chat.completions:",
          this.getErrorMessage(error),
        );

        return await this.createStreamingChatCompletion(
          {
            model: this.model,
            messages:
              this.convertChatMessages(
                params.messages,
              ),
            ...(params.tools?.length
              ? {
                  tools:
                    this.convertChatTools(
                      params.tools,
                    ),
                }
              : {}),
          },
          params.onToken,
        );
      }
    }

    let response:
      OpenAI.Responses.Response;

    try {
      response =
        await this.client.responses.create(
          {
            ...request,
            stream: false,
          },
        );
    } catch (error: unknown) {
      console.warn(
        "[OpenAI] Responses request failed, falling back to chat.completions:",
        this.getErrorMessage(error),
      );

      return await this.createChatCompletion(
        {
          model: this.model,
          messages:
            this.convertChatMessages(
              params.messages,
            ),
          ...(params.tools?.length
            ? {
                tools:
                  this.convertChatTools(
                    params.tools,
                  ),
              }
            : {}),
        },
      );
    }

    // console.log(
    //   "[OpenAI] response received",
    //   response
    // );

    console.log(
      "[OpenAI] output items:",
      response.output,
    );
    console.log(
      "[OpenAI] output items length:",
      response.output.length,
    );

    return this.parseResponse(
      response,
    );
  }

  private async createStreamingResponse(
    request: OpenAIResponseRequest,
    onToken: (token: string) => void,
  ): Promise<ModelResponse> {
    const stream =
      await this.client.responses.create(
        {
          ...request,
          stream: true,
        },
      );

    const textParts: string[] = [];
    const functionCallsByItemId =
      new Map<string, FunctionCall>();
    let completedResponse:
      | OpenAI.Responses.Response
      | undefined;

    for await (const event of stream) {
      if (event.type === "error") {
        throw new Error(`Responses stream error: ${event.message}`);
      }
      if (event.type === "response.failed") {
        throw new Error(
          `Responses request failed: ${event.response.error?.message ?? "unknown error"}`,
        );
      }
      if (event.type === "response.incomplete") {
        throw new Error(
          `Responses request incomplete: ${event.response.incomplete_details?.reason ?? "unknown reason"}`,
        );
      }
      if (
        event.type ===
        "response.output_text.delta"
      ) {
        textParts.push(event.delta);
        onToken(event.delta);
        continue;
      }

      if (
        event.type ===
        "response.output_item.added" ||
        event.type ===
        "response.output_item.done"
      ) {
        this.collectFunctionCall(
          event.item,
          functionCallsByItemId,
        );
        continue;
      }

      if (
        event.type ===
        "response.function_call_arguments.done"
      ) {
        this.collectFunctionCallArgumentsDone(
          event,
          functionCallsByItemId,
        );
        continue;
      }

      if (
        event.type ===
        "response.completed"
      ) {
        completedResponse =
          event.response;
      }
    }

    if (completedResponse) {
      const response = this.parseResponse(completedResponse);
      // output_text is an SDK convenience field, absent in raw SSE responses.
      response.content ||= textParts.join("") || null;
      if (response.functionCalls.length === 0) {
        response.functionCalls = [...functionCallsByItemId.values()];
      }
      if (!response.content?.trim() && response.functionCalls.length === 0) {
        throw new EmptyResponseStreamError("Responses stream returned no text or tool calls.");
      }
      return response;
    }

    if (textParts.length === 0 && functionCallsByItemId.size === 0) {
      throw new EmptyResponseStreamError("Responses stream returned no text or tool calls.");
    }
    throw new Error("Responses stream ended before response.completed.");
  }

  private collectFunctionCall(
    item: ResponseStreamEvent extends infer T
      ? T extends {
          item: infer Item;
        }
        ? Item
        : never
      : never,
    functionCallsByItemId: Map<
      string,
      FunctionCall
    >,
  ): void {
    if (
      !item ||
      typeof item !== "object" ||
      !("type" in item) ||
      item.type !== "function_call"
    ) {
      return;
    }

    const functionCall = item as {
      id?: string;
      call_id: string;
      name: string;
      arguments: string;
    };

    functionCallsByItemId.set(
      functionCall.id ??
        functionCall.call_id,
      {
        type: "function_call",
        call_id:
          functionCall.call_id,
        name: functionCall.name,
        arguments:
          functionCall.arguments,
      },
    );
  }

  private collectFunctionCallArgumentsDone(
    event: Extract<
      ResponseStreamEvent,
      {
        type: "response.function_call_arguments.done";
      }
    >,
    functionCallsByItemId: Map<
      string,
      FunctionCall
    >,
  ): void {
    const existing =
      functionCallsByItemId.get(
        event.item_id,
      );

    functionCallsByItemId.set(
      event.item_id,
      {
        type: "function_call",
        call_id:
          existing?.call_id ??
          event.item_id,
        name: event.name,
        arguments:
          event.arguments,
      },
    );
  }

  private async createChatCompletion(
    request: OpenAIChatRequest,
  ): Promise<ModelResponse> {
    const response =
      await this.client.chat.completions.create(
        {
          ...request,
          stream: false,
        },
      );

    const message =
      response.choices[0]?.message;

    const functionCalls: FunctionCall[] =
      [];

    for (
      const toolCall of
        message?.tool_calls ?? []
    ) {
      if (
        toolCall.type !== "function"
      ) {
        continue;
      }

      functionCalls.push({
        type: "function_call",
        call_id: toolCall.id,
        name:
          toolCall.function.name,
        arguments:
          toolCall.function.arguments,
      });
    }

    return {
      content:
        typeof message?.content ===
        "string"
          ? message.content
          : null,
      functionCalls,
    };
  }

  private async createStreamingChatCompletion(
    request: OpenAIChatRequest,
    onToken: (token: string) => void,
  ): Promise<ModelResponse> {
    const streamRequest:
      ChatCompletionCreateParamsStreaming =
        {
          ...request,
          stream: true,
        };

    const stream =
      await this.client.chat.completions.create(
        streamRequest,
      );

    const textParts: string[] = [];
    let finished = false;
    const toolCalls =
      new Map<
        number,
        {
          id?: string;
          name?: string;
          arguments: string;
        }
      >();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (choice?.finish_reason) {
        if (!["stop", "tool_calls"].includes(choice.finish_reason)) {
          throw new Error(`Chat stream incomplete: ${choice.finish_reason}`);
        }
        finished = true;
      }
      const delta =
        choice?.delta;

      if (!delta) {
        continue;
      }

      if (delta.content) {
        textParts.push(
          delta.content,
        );
        onToken(delta.content);
      }

      for (
        const toolCall of
          delta.tool_calls ?? []
      ) {
        const index =
          toolCall.index;
        const current =
          toolCalls.get(index) ?? {
            arguments: "",
          };

        if (toolCall.id) {
          current.id = toolCall.id;
        }

        if (
          toolCall.function?.name
        ) {
          current.name =
            toolCall.function.name;
        }

        if (
          toolCall.function?.arguments
        ) {
          current.arguments +=
            toolCall.function.arguments;
        }

        toolCalls.set(
          index,
          current,
        );
      }
    }

    const functionCalls: FunctionCall[] =
      [];

    if (!finished) {
      throw new Error("Chat stream ended before a finish_reason was received.");
    }

    for (
      const [index, toolCall] of
        toolCalls
    ) {
      if (!toolCall.name) {
        continue;
      }

      functionCalls.push({
        type: "function_call",
        call_id:
          toolCall.id ??
          `call_${index}`,
        name: toolCall.name,
        arguments:
          toolCall.arguments,
      });
    }

    return {
      content:
        textParts.length > 0
          ? textParts.join("")
          : null,
      functionCalls,
    };
  }

  private convertChatMessages(
    messages: ContextItem[],
  ): ChatCompletionMessageParam[] {
    const result:
      ChatCompletionMessageParam[] =
        [];

    for (const message of messages) {
      if ("role" in message) {
        result.push({
          role: message.role,
          content:
            message.content,
        });
        continue;
      }

      if (
        message.type ===
        "function_call"
      ) {
        result.push({
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: message.call_id,
              type: "function",
              function: {
                name: message.name,
                arguments:
                  message.arguments,
              },
            },
          ],
        });
        continue;
      }

      result.push({
        role: "tool",
        tool_call_id:
          message.call_id,
        content:
          message.output,
      });
    }

    return result;
  }

  private convertChatTools(
    tools: ToolDefinition[],
  ): ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description:
          tool.description,
        parameters:
          tool.parameters,
        ...(tool.strict !== undefined
          ? {
              strict:
                tool.strict,
            }
          : {}),
      },
    }));
  }

  private getErrorMessage(
    error: unknown,
  ): string {
    return error instanceof Error
      ? error.message
      : String(error);
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
    const content = response.output_text || response.output
      .flatMap((item) => item.type === "message" ? item.content : [])
      .map((part) => {
        if (part.type === "output_text") return part.text;
        if (part.type === "refusal") return part.refusal;
        return "";
      })
      .join("") || null;

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
