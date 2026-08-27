import type { FunctionCall } from "../llm/types.js";

/**
 * System Message
 */
export interface SystemMessage {
  role: "system";
  content: string;
}

/**
 * User Message
 */
export interface UserMessage {
  role: "user";
  content: string;
}

/**
 * Assistant Message
 */
export interface AssistantMessage {
  role: "assistant";
  content: string;
}

/**
 * Function Call
 */
export interface FunctionCallItem {
  type: "function_call";

  call_id: string;

  name: string;

  arguments: string;
}

/**
 * Function Call Output
 */
export interface FunctionCallOutputItem {
  type: "function_call_output";

  call_id: string;

  output: string;
}

/**
 * Agent Context Item
 */
export type ContextItem =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | FunctionCallItem
  | FunctionCallOutputItem;

/**
 * Agent Context
 */
export class AgentContext {
  private items: ContextItem[] = [];

  constructor(systemPrompt?: string) {
    if (systemPrompt !== undefined) {
      this.addSystemMessage(systemPrompt);
    }
  }

  /**
   * 添加 System Message
   */
  addSystemMessage(content: string): void {
    this.items.push({
      role: "system",
      content,
    });
  }

  /**
   * 添加 User Message
   */
  addUserMessage(content: string): void {
    this.items.push({
      role: "user",
      content,
    });
  }

  /**
   * 添加 Assistant Message
   */
  addAssistantMessage(content: string): void {
    this.items.push({
      role: "assistant",
      content,
    });
  }

  /**
   * 添加 Function Call
   */
  addFunctionCall(
    functionCall: FunctionCall,
  ): void {
    this.items.push({
      type: "function_call",
      call_id: functionCall.call_id,
      name: functionCall.name,
      arguments: functionCall.arguments,
    });
  }

  /**
   * 添加 Function Call Output
   */
  addFunctionCallOutput(
    callId: string,
    output: string,
  ): void {
    this.items.push({
      type: "function_call_output",
      call_id: callId,
      output,
    });
  }

  /**
   * 获取全部 Context
   */
  getItems(): ContextItem[] {
    return [...this.items];
  }

  /**
   * 获取 Context 数量
   */
  get length(): number {
    return this.items.length;
  }

  /**
   * 获取最后一个 Context Item
   */
  last(): ContextItem | undefined {
    return this.items[this.items.length - 1];
  }

  /**
   * 删除最后一个 Context Item
   */
  pop(): ContextItem | undefined {
    return this.items.pop();
  }

  /**
   * 清空 Context
   */
  clear(): void {
    this.items = [];
  }

  /**
   * 重置 Context
   */
  reset(systemPrompt?: string): void {
    this.items = [];

    if (systemPrompt !== undefined) {
      this.addSystemMessage(systemPrompt);
    }
  }

  /**
   * 获取 System Prompt
   *
   * 注意：
   * ContextItem 并不是所有类型都有 role。
   *
   * FunctionCallItem 和 FunctionCallOutputItem
   * 使用 type 字段。
   */
  getSystemPrompt(): string {
    return this.items
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

    /**
   * 获取指定 Function Call
   */
  getFunctionCall(
    callId: string,
  ): FunctionCallItem | undefined {
    for (const item of this.items) {
      if (
        "type" in item &&
        item.type === "function_call" &&
        item.call_id === callId
      ) {
        return item;
      }
    }

    return undefined;
  }

  /**
   * 获取指定 Function Call Output
   */
  getFunctionCallOutput(
    callId: string,
  ): FunctionCallOutputItem | undefined {
    for (const item of this.items) {
      if (
        "type" in item &&
        item.type === "function_call_output" &&
        item.call_id === callId
      ) {
        return item;
      }
    }

    return undefined;
  }

  /**
   * 判断 Function Call 是否已经执行
   */
  hasFunctionCallOutput(
    callId: string,
  ): boolean {
    return this.items.some(
      (item) =>
        "type" in item &&
        item.type === "function_call_output" &&
        item.call_id === callId,
    );
  }

  /**
   * 转换成 JSON
   */
  toJSON(): ContextItem[] {
    return this.items.map(
      (item) => ({
        ...item,
      }),
    );
  }

  /**
   * Debug
   */
  debug(): void {
    console.log(
      "\n===== Agent Context =====",
    );

    this.items.forEach(
      (item, index) => {
        console.log(
          `[${index}]`,
          item,
        );
      },
    );

    console.log(
      "=========================\n",
    );
  }
}