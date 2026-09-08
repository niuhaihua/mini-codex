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

interface ToolResult {
  success?: boolean;
  id?: string;
  stdout?: string;
  error?: string;
  hasChanges?: boolean;
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

  /** Checkpoint created automatically for the current run. */
  private automaticCheckpointId:
    string | undefined;

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

    this.automaticCheckpointId =
      await this.createAutomaticCheckpoint();

    try {
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
          await this.checkGitChanges(false);
          await this.discardAutomaticCheckpoint();
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

        await this.checkGitChanges(true);
      }

      throw new Error(
        `Agent exceeded maximum iterations: ${this.maxIterations}`
      );
    } catch (error: unknown) {
      await this.rollbackAutomaticCheckpoint();
      throw error;
    } finally {
      this.automaticCheckpointId =
        undefined;
    }
  }

  /**
   * 执行一个 Function Call
   */
  /** 创建自动检查点 */
  private async createAutomaticCheckpoint(): Promise<string | undefined> {
    const result = await this.executeInternalTool("git_checkpoint");
    if (result?.success && result.id) {
      console.log("[Agent] Git checkpoint created: " + result.id);
      return result.id;
    }
    if (result?.error) console.warn("[Agent] Git checkpoint unavailable: " + result.error);
    return undefined;
  }

  /** 记录工作树变化 */
  private async checkGitChanges(addToContext: boolean): Promise<void> {
    const checkpointId = this.automaticCheckpointId;
    const inspection = checkpointId
      ? await this.executeInternalTool("git_checkpoint_inspect", { checkpointId })
      : undefined;
    if (!inspection?.success || !inspection.hasChanges) return;
    const report = inspection.stdout?.trim();
    if (!report) return;
    console.log("[Agent] changes since checkpoint:\n" + report);
    if (addToContext) {
      this.context.addUserMessage(
        "Automatic Git change inspection after the last tool batch:\n" +
          report.slice(0, 50000),
      );
    }
  }

  /** 回滚自动检查点 */
  private async rollbackAutomaticCheckpoint(): Promise<void> {
    const checkpointId = this.automaticCheckpointId;
    if (!checkpointId) return;
    const result = await this.executeInternalTool("git_rollback", { checkpointId });
    if (result?.success) console.log("[Agent] rolled back Git checkpoint: " + checkpointId);
    else console.warn("[Agent] unable to roll back Git checkpoint " + checkpointId + ": " + (result?.error ?? "unknown error"));
  }

  /** 释放成功运行的检查点以避免保留快照。 */
  private async discardAutomaticCheckpoint(): Promise<void> {
    const checkpointId = this.automaticCheckpointId;
    if (!checkpointId) return;
    await this.executeInternalTool("git_checkpoint_discard", { checkpointId });
    this.automaticCheckpointId = undefined;
  }

  /** 执行隐藏的生命周期工具并容忍不可用的 Git 支持。 */
  private async executeInternalTool(name: string, args: ToolArguments = {}): Promise<ToolResult | undefined> {
    if (!this.toolExecutor) return undefined;
    try {
      const parsed: unknown = JSON.parse(await this.toolExecutor.execute(name, args));
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as ToolResult;
    } catch (error: unknown) {
      if (name !== "git_checkpoint") console.warn("[Agent] internal tool " + name + " failed: " + (error instanceof Error ? error.message : String(error)));
    }
    return undefined;
  }

  /** 执行一个 Function Call */
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
