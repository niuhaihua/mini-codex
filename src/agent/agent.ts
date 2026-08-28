import { AgentContext } from "./context.js";
import { getSystemPrompt } from "./prompt.js";

import type {
  FunctionCall,
  ModelClient,
  ToolDefinition,
} from "../llm/types.js";

/**
 * Tool 参数
 */
export type ToolArguments = Record<
  string,
  unknown
>;

/**
 * Tool 执行器
 */
export interface ToolExecutor {
  execute(
    name: string,
    args: ToolArguments
  ): Promise<string>;
}

/**
 * Agent 配置
 */
export interface AgentOptions {
  model: ModelClient;

  tools?: ToolDefinition[];

  toolExecutor?: ToolExecutor;

  maxIterations?: number;

  systemPrompt?: string;
}

/**
 * Agent
 */
export class Agent {
  private readonly model: ModelClient;

  private readonly tools: ToolDefinition[];

  private readonly toolExecutor:
    | ToolExecutor
    | undefined;

  private readonly maxIterations: number;

  private readonly systemPrompt: string;

  private context: AgentContext;

  constructor(options: AgentOptions) {
    this.model = options.model;

    this.tools = options.tools ?? [];

    this.toolExecutor =
      options.toolExecutor;

    this.maxIterations =
      options.maxIterations ?? 20;

    this.systemPrompt =
      options.systemPrompt ??
      getSystemPrompt();

    this.context =
      new AgentContext(
        this.systemPrompt
      );
  }

  /**
   * 执行用户任务
   */
  async run(
    userMessage: string
  ): Promise<string> {
    this.context.addUserMessage(
      userMessage
    );

    for (
      let iteration = 0;
      iteration < this.maxIterations;
      iteration++
    ) {
      console.log(
        `[Agent] iteration: ${
          iteration + 1
        }/${this.maxIterations}`
      );

      const response =
        await this.model.chat({
          messages:
            this.context.getItems(),
          tools: this.tools,
        });

      /**
       * 保存 Assistant 文本
       */
      if (
        response.content &&
        response.content.trim()
      ) {
        this.context.addAssistantMessage(
          response.content
        );

        console.log(
          "[Agent] assistant:",
          response.content
        );
      }

      /**
       * 没有 Tool Call
       */
      if (
        response.functionCalls.length ===
        0
      ) {
        return response.content ?? "";
      }

      /**
       * 保存 Function Calls
       */
      for (
        const functionCall of
          response.functionCalls
      ) {
        this.context.addFunctionCall(
          functionCall
        );
      }

      /**
       * 执行 Function Calls
       */
      for (
        const functionCall of
          response.functionCalls
      ) {
        const result =
          await this.executeFunctionCall(
            functionCall
          );

        this.context.addFunctionCallOutput(
          functionCall.call_id,
          result
        );
      }
    }

    throw new Error(
      `Agent exceeded maximum iterations: ${this.maxIterations}`
    );
  }

  /**
   * 执行一个 Function Call
   */
  private async executeFunctionCall(
    functionCall: FunctionCall
  ): Promise<string> {
    const {
      call_id,
      name,
      arguments: rawArguments,
    } = functionCall;

    console.log(
      `[Agent] tool: ${name}`
    );

    console.log(
      `[Agent] arguments: ${rawArguments}`
    );

    if (!this.toolExecutor) {
      return JSON.stringify({
        success: false,
        error:
          "No tool executor is configured.",
        tool: name,
        call_id,
      });
    }

    /**
     * 解析参数
     */
    let args: ToolArguments;

    try {
      const parsed: unknown =
        JSON.parse(
          rawArguments || "{}"
        );

      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        return JSON.stringify({
          success: false,
          error:
            "Tool arguments must be a JSON object.",
          tool: name,
          call_id,
        });
      }

      args = parsed as ToolArguments;
    } catch {
      return JSON.stringify({
        success: false,
        error:
          "Invalid JSON tool arguments.",
        tool: name,
        call_id,
      });
    }

    /**
     * 执行 Tool
     */
    try {
      return await this.toolExecutor.execute(
        name,
        args
      );
    } catch (error: unknown) {
      return JSON.stringify({
        success: false,
        tool: name,
        call_id,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }

  /**
   * 获取 Context
   */
  getContext(): AgentContext {
    return this.context;
  }

  /**
   * 重置 Agent
   */
  reset(): void {
    this.context =
      new AgentContext(
        this.systemPrompt
      );
  }
}