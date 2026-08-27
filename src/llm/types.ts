import type { ContextItem } from "../agent/context.js";

/**
 * Function Call
 *
 * Responses API 返回：
 *
 * {
 *   type: "function_call",
 *   call_id: "...",
 *   name: "read_file",
 *   arguments: "{...}"
 * }
 */
export interface FunctionCall {
  type: "function_call";

  call_id: string;

  name: string;

  arguments: string;
}

/**
 * LLM 返回结果
 */
export interface ModelResponse {
  /**
   * 模型输出文本
   */
  content: string | null;

  /**
   * 模型请求执行的 Function
   */
  functionCalls: FunctionCall[];
}

/**
 * JSON Schema 类型
 *
 * 用于描述 Tool 参数。
 */
export type JsonSchema = {
  type?: string;

  properties?: Record<
    string,
    JsonSchema
  >;

  required?: string[];

  items?: JsonSchema;

  description?: string;

  enum?: unknown[];

  additionalProperties?: boolean;

  [key: string]: unknown;
};

/**
 * Function Tool
 *
 * 对应 Responses API：
 *
 * {
 *   type: "function",
 *   name: "read_file",
 *   description: "...",
 *   parameters: {...}
 * }
 */
export interface ToolDefinition {
  type: "function";

  name: string;

  description: string;

  parameters: JsonSchema;

  strict?: boolean;
}

/**
 * LLM Client 抽象接口
 *
 * Agent 不需要知道具体使用的是：
 *
 * OpenAI
 * Azure OpenAI
 * OpenAI Compatible API
 * Claude
 * Gemini
 *
 * 只需要调用 chat()。
 */
export interface ModelClient {
  chat(params: {
    messages: ContextItem[];

    tools?: ToolDefinition[];
  }): Promise<ModelResponse>;
}