import { AgentContext } from "./context.js";
import { getSystemPrompt } from "./prompt.js";

import type {
  FunctionCall,
  ModelClient,
  ToolDefinition,
} from "../llm/types.js";

/**
 * Tool 执行器
 */
export interface ToolExecutor {
  execute(
    name: string,
    args: Record<
      string,
      unknown
    >,
  ): Promise<string>;
}

/**
 * Agent 配置
 */
export interface AgentOptions {
  /**
   * LLM Client
   */
  model: ModelClient;

  /**
   * Agent 可使用的 Tools
   */
  tools?: ToolDefinition[];

  /**
   * Tool 执行器
   */
  toolExecutor?: ToolExecutor;

  /**
   * 最大循环次数
   */
  maxIterations?: number;

  /**
   * System Prompt
   */
  systemPrompt?: string;
}

/**
 * Agent
 *
 * 主循环：
 *
 * User
 * ↓
 * LLM
 * ↓
 * Function Call？
 * ├── 否 → Final Answer
 * │
 * └── 是
 *      ↓
 *    Tool
 *      ↓
 * Function Call Output
 *      ↓
 *     LLM
 *      ↓
 *    ...
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

  constructor(
    options: AgentOptions,
  ) {
    this.model = options.model;

    this.tools =
      options.tools ?? [];

    this.toolExecutor =
      options.toolExecutor;

    this.maxIterations =
      options.maxIterations ?? 20;

    this.systemPrompt =
      options.systemPrompt ??
      getSystemPrompt();

    this.context =
      new AgentContext(
        this.systemPrompt,
      );
  }

  /**
   * 执行用户任务
   */
  async run(
    userMessage: string,
  ): Promise<string> {
    /**
     * 添加 User Message
     */
    this.context.addUserMessage(
      userMessage,
    );

    /**
     * Agent Loop
     */
    for (
      let iteration = 0;
      iteration <
      this.maxIterations;
      iteration++
    ) {
      console.log(
        `[Agent] iteration: ${
          iteration + 1
        }`,
      );

      /**
       * 调用 LLM
       */
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
        response.content !==
        null &&
        response.content.length >
          0
      ) {
        this.context.addAssistantMessage(
          response.content,
        );

        console.log(
          "[Agent] assistant:",
          response.content,
        );
      }

      /**
       * 保存 Function Calls
       */
      for (
        const functionCall of
          response.functionCalls
      ) {
        this.context.addFunctionCall(
          functionCall,
        );
      }

      /**
       * 没有 Tool Call
       *
       * 说明模型已经完成任务。
       */
      if (
        response.functionCalls
          .length === 0
      ) {
        return (
          response.content ?? ""
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
            functionCall,
          );

        /**
         * 保存 Tool Result
         */
        this.context.addFunctionCallOutput(
          functionCall.call_id,
          result,
        );
      }
    }

    throw new Error(
      `Agent exceeded maximum iterations: ${this.maxIterations}`,
    );
  }

  /**
   * 执行一个 Function Call
   */
  private async executeFunctionCall(
    functionCall: FunctionCall,
  ): Promise<string> {
    const {
      call_id,
      name,
      arguments:
        rawArguments,
    } = functionCall;

    console.log(
      `[Agent] tool: ${name}`,
    );

    console.log(
      `[Agent] arguments: ${rawArguments}`,
    );

    /**
     * 没有 Tool Executor
     */
    if (
      this.toolExecutor ===
      undefined
    ) {
      return JSON.stringify({
        success: false,

        error:
          "No tool executor is configured.",

        tool: name,
      });
    }

    /**
     * 解析参数
     */
    let args: Record<
      string,
      unknown
    >;

    try {
      const parsed =
        JSON.parse(
          rawArguments || "{}",
        );

      /**
       * Tool 参数必须是 Object
       */
      if (
        parsed === null ||
        typeof parsed !==
          "object" ||
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

      args =
        parsed as Record<
          string,
          unknown
        >;
    } catch {
      return JSON.stringify({
        success: false,

        error:
          `Invalid JSON arguments: ${rawArguments}`,

        tool: name,

        call_id,
      });
    }

    /**
     * 执行 Tool
     */
    try {
      const result =
        await this.toolExecutor.execute(
          name,
          args,
        );

      return result;
    } catch (error) {
      /**
       * Tool 执行失败
       *
       * 将错误交给模型继续处理。
       */
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
        this.systemPrompt,
      );
  }
}