import path from "node:path";
import readline from "node:readline/promises";
import {
  stdin as input,
  stdout as output,
} from "node:process";

import { Agent } from "./agent/agent.js";
import { OpenAIModel } from "./llm/openai.js";
import { AnthropicModel } from "./llm/anthropic.js";
import { GeminiModel } from "./llm/gemini.js";
import { Workspace } from "./workspace/workspace.js";
import { config } from "./config.js";

import {
  toolDefinitions,
  createToolExecutor,
} from "./tools/index.js";

async function main(): Promise<void> {
  const apiKey = config.apiKey;
  const baseURL = config.baseURL;
  const curModel = config.model;
  if (!apiKey) {
    throw new Error(
      "MODEL_API_KEY is not configured."
    );
  }

  /**
   * Model
   */
  const modelConfig = {
    apiKey,
    model: curModel,
    timeoutMs: config.timeoutMs,
    ...(baseURL
      ? {
          baseURL,
        }
      : {}),
  };

  let model;

  switch (config.provider) {
    case "openai":
    case "openai-compatible":
      model = new OpenAIModel(modelConfig);
      break;

    case "anthropic":
      model = new AnthropicModel(modelConfig);
      break;
    case "gemini":
      model = new GeminiModel(modelConfig);
      break;
    default:
      throw new Error(
        `不支持的模型提供商: ${config.provider}`
      );
  }
    

  /**
   * Workspace
   */
  const workspace =
    new Workspace(
      path.resolve(
        process.cwd(),
        "workspace"
      )
    );

  /**
   * Tool Executor
   *
   * 将 Workspace 注入 Tool。
   */
  const toolExecutor =
    createToolExecutor(
      workspace
    );

  /**
   * Agent
   */
  const agent =
    new Agent({
      model,
      tools: toolDefinitions,
      toolExecutor,
    });

  /**
   * CLI
   */
  const rl =
    readline.createInterface({
      input,
      output,
    });

  console.log(
    "================================="
  );
  console.log(
    "       Mini Codex Agent"
  );
  console.log(
    "================================="
  );

  console.log(
    "Agent 已启动，可以开始提问。"
  );

  console.log(
    "输入 exit、quit 或 q 退出。"
  );

  console.log(
    `Workspace: ${workspace.getRoot()}`
  );

  console.log();

  try {
    while (true) {
      const question =
        (
          await rl.question(
            "You: "
          )
        ).trim();

      if (!question) {
        continue;
      }

      if (
        [
          "exit",
          "quit",
          "q",
        ].includes(
          question.toLowerCase()
        )
      ) {
        console.log(
          "Agent 已退出。"
        );

        break;
      }

      try {
        const result =
          await agent.run(
            question
          );

        console.log(
          "\nAgent:"
        );

        console.log(result);

        console.log();
      } catch (
        error: unknown
      ) {
        console.error(
          "\n执行任务时发生错误："
        );

        if (
          error instanceof Error
        ) {
          console.error(
            error.message
          );
        } else {
          console.error(
            String(error)
          );
        }

        console.log();
      }
    }
  } finally {
    rl.close();
  }
}

main().catch(
  (error: unknown) => {
    console.error(
      "\nAgent Error:"
    );

    if (
      error instanceof Error
    ) {
      console.error(
        error.message
      );

      if (error.stack) {
        console.error(
          error.stack
        );
      }
    } else {
      console.error(
        String(error)
      );
    }

    process.exitCode = 1;
  }
);
