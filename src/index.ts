import path from "node:path";

import { Agent } from "./agent/agent.js";
import { OpenAIModel } from "./llm/openai.js";
import { Workspace } from "./workspace/workspace.js";

async function main(): Promise<void> {
  /**
   * =========================
   * 1. OpenAI 配置
   * =========================
   *
   * 如果使用官方 API：
   *
   * baseURL:
   * https://api.openai.com/v1
   *
   * 如果使用 OpenAI Compatible 中转站，
   * 修改成对应的 /v1 地址即可。
   */
  const model = new OpenAIModel({
    apiKey: "",
    baseURL:"",
    model: "gpt-5.6-sol",
  });

  /**
   * =========================
   * 2. 创建 Workspace
   * =========================
   *
   * 当前项目根目录下的 workspace
   *
   * 例如：
   *
   * project/
   * ├── src/
   * ├── package.json
   * └── workspace/
   */
  const workspace =
    new Workspace(
      path.resolve(
        process.cwd(),
        "workspace",
      ),
    );

  /**
   * =========================
   * 3. 创建 Agent
   * =========================
   */
  const agent = new Agent({
    model,
  });

  /**
   * =========================
   * 4. 执行任务
   * =========================
   */
  const result =
    await agent.run(
      "你好，请介绍一下你自己。",
    );

  /**
   * =========================
   * 5. 输出结果
   * =========================
   */
  console.log(
    "\n==============================",
  );

  console.log(
    "Agent Result:",
  );

  console.log(
    "==============================\n",
  );

  console.log(result);

  /**
   * =========================
   * 6. 输出 Workspace
   * =========================
   */
  console.log(
    "\nWorkspace:",
  );

  console.log(
    workspace.getRoot(),
  );
}

/**
 * 启动
 */
main().catch(
  (error: unknown) => {
    console.error(
      "\nAgent Error:",
    );

    if (
      error instanceof Error
    ) {
      console.error(
        error.message,
      );

      if (
        error.stack
      ) {
        console.error(
          error.stack,
        );
      }
    } else {
      console.error(
        error,
      );
    }

    process.exitCode = 1;
  },
);