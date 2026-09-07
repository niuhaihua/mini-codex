# Mini Codex

一个基于 **TypeScript + Node.js + OpenAI Responses API** 实现的轻量级 Coding Agent。

Mini Codex 的核心目标是理解用户的自然语言指令，并通过 LLM 自动调用文件系统和命令执行工具完成开发任务。

目前已经支持：

* 📁 文件目录浏览
* 📖 文件读取
* ✍️ 文件创建与写入
* 📝 文件内容编辑
* 🗑️ 文件删除
* 🔎 文件内容搜索
* 💻 Shell / CMD 命令执行
* Git 状态、diff、log 与 commit
* Git checkpoint / rollback
* Agent 自动检查修改，并在异常时自动回滚
* 🛡️ Workspace 工作区路径隔离
* 🔄 Agent Tool Calling 循环
* 🤖 OpenAI Responses API
* 🖥️ CLI 交互模式

---

## 1. 项目架构

整体执行流程：

```text
                    User
                     │
                     ▼
                CLI / index.ts
                     │
                     ▼
                  Agent
                     │
                     ▼
             OpenAI Responses API
                     │
                     ▼
               Function Call
                     │
                     ▼
              Tool Executor
                     │
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼
      Workspace              Tools
          │                     │
          │          ┌──────────┼──────────┐
          │          │          │          │
          ▼          ▼          ▼          ▼
       路径安全    文件操作    搜索       命令
          │
          ▼
      File System
          │
          ▼
      Tool Result
          │
          └──────────────► Agent
                              │
                              ▼
                            LLM
```

Agent 的基本循环：

```text
User
 ↓
LLM
 ↓
是否需要 Tool？
 ├── 否 → Final Answer
 │
 └── 是
      ↓
   Function Call
      ↓
    Tool
      ↓
 Tool Result
      ↓
     LLM
      ↓
     ...
```

---

## 2. 技术栈

| 技术                   | 用途                      |
| -------------------- | ----------------------- |
| TypeScript           | 项目主要开发语言                |
| Node.js              | Agent 运行环境              |
| OpenAI SDK           | 调用 OpenAI Responses API |
| OpenAI Responses API | LLM 与 Tool Calling      |
| dotenv               | 环境变量配置                  |
| readline             | CLI 交互                  |
| Node.js fs/promises  | 文件系统操作                  |
| tsx                  | TypeScript 开发运行         |
| pnpm / npm           | 包管理                     |

---

## 3. 项目结构

```text
mini-codex/
│
├── src/
│   │
│   ├── agent/
│   │   ├── agent.ts
│   │   ├── context.ts
│   │   └── prompt.ts
│   │
│   ├── llm/
│   │   ├── openai.ts
│   │   └── types.ts
│   │
│   ├── tools/
│   │   ├── index.ts
│   │   ├── tool.ts
│   │   ├── listFiles.ts
│   │   ├── readFile.ts
│   │   ├── writeFile.ts
│   │   ├── editFile.ts
│   │   ├── deleteFile.ts
│   │   ├── searchFiles.ts
│   │   └── runCommand.ts
│   │
│   ├── workspace/
│   │   └── workspace.ts
│   │
│   └── index.ts
│
├── workspace/
│   └── ...
│
├── .env
├── package.json
├── tsconfig.json
└── README.md
```

---

## 4. Workspace

Mini Codex 不直接允许 Agent 任意操作项目文件。

所有文件操作都通过 `Workspace` 进行路径解析。

```ts
const workspace = new Workspace(
  path.resolve(process.cwd(), "workspace")
);
```

例如：

```text
mini-codex/
├── src/
├── workspace/
│   ├── src/
│   │   └── index.ts
│   └── package.json
└── package.json
```

Agent 请求：

```json
{
  "path": "src/index.ts"
}
```

最终访问：

```text
mini-codex/workspace/src/index.ts
```

### Workspace 路径安全

`Workspace.resolve()` 会检查路径是否位于 Workspace 内部。

例如：

```text
src/index.ts
```

允许访问。

而：

```text
../package.json
```

会被拒绝。

核心逻辑：

```ts
resolve(relativePath: string): string {
  const absolutePath = path.resolve(
    this.root,
    relativePath,
  );

  this.ensureInsideWorkspace(
    absolutePath,
  );

  return absolutePath;
}
```

因此 Agent 无法通过普通文件 Tool 越过 Workspace 操作外部文件。

---

## 5. Tools

目前 Mini Codex 支持 13 个公开 Tool。

### 5.1 list_files

列出目录中的文件和目录。

调用参数：

```json
{
  "path": "src"
}
```

功能：

```text
workspace/src/
├── index.ts
├── agent.ts
└── tools/
```

如果不传 `path`，默认使用 Workspace 根目录。

---

### 5.2 read_file

读取文件内容。

调用参数：

```json
{
  "path": "src/index.ts"
}
```

返回文件文本内容。

---

### 5.3 write_file

创建或者覆盖文件。

调用参数：

```json
{
  "path": "src/test.ts",
  "content": "console.log('hello');"
}
```

如果父目录不存在，会自动创建。

---

### 5.4 edit_file

修改文件中的指定文本。

调用参数：

```json
{
  "path": "src/index.ts",
  "oldText": "console.log('hello');",
  "newText": "console.log('Hello Mini Codex');"
}
```

为了避免 Agent 误修改多个位置，目前要求 `oldText` 在文件中必须只出现一次。

如果出现多次：

```text
oldText 在文件中出现了 3 次，无法确定应该修改哪一处
```

Tool 会返回错误，Agent 可以根据错误重新读取文件并尝试修改。

---

### 5.5 delete_file

删除指定文件。

调用参数：

```json
{
  "path": "src/test.ts"
}
```

如果目标不是文件，则返回错误。

---

### 5.6 search_files

搜索 Workspace 中的文件内容。

调用参数：

```json
{
  "query": "Mini Codex",
  "path": "src"
}
```

返回匹配文件、行号以及匹配内容。

例如：

```json
[
  {
    "path": "src/index.ts",
    "line": 10,
    "content": "console.log('Mini Codex');"
  }
]
```

---

### 5.7 run_command

在 Workspace 根目录执行命令。

调用参数：

```json
{
  "command": "npm test"
}
```

Windows 下使用：

```text
cmd.exe
```

Linux / macOS 下使用：

```text
/bin/bash
```

同时设置：

```text
cwd = workspace.getRoot()
```

因此命令默认在 Workspace 中执行。

例如：

```text
You:
执行 node -v
```

Agent 可以调用：

```text
run_command
```

最终相当于在：

```text
mini-codex/workspace/
```

中执行命令。

---

### 5.8 git_status

显示当前分支和工作区状态，等价于 `git status --short --branch`。

---

### 5.9 git_diff

显示工作区 diff。传入 `{"staged": true}` 时显示已暂存的 diff。

---

### 5.10 git_log

显示最近的 Git 提交记录。`maxCount` 默认值为 10，取值范围为 1-100。

---

### 5.11 git_commit

使用 `message` 提交已经暂存的修改。该 Tool 不会自动执行 `git add`。

---

### 5.12 git_checkpoint

创建当前 Git 状态的临时 checkpoint，并返回 `checkpointId`。

---

### 5.13 git_rollback

使用 `checkpointId` 恢复 checkpoint。该操作会丢弃 checkpoint 创建之后的修改，但会保留 checkpoint 创建之前已有的 staged、unstaged 和 untracked 文件。

---

## 6. Tool 注入

Tools 并不是直接使用全局文件系统。

启动 Agent 时，将 Workspace 注入 Tool：

```ts
const workspace = new Workspace(
  path.resolve(
    process.cwd(),
    "workspace"
  )
);

const toolExecutor =
  createToolExecutor(
    workspace
  );

const agent = new Agent({
  model,
  tools: toolDefinitions,
  toolExecutor,
});
```

因此依赖关系为：

```text
index.ts
   │
   ▼
Workspace
   │
   ▼
createToolExecutor()
   │
   ▼
Tools
   │
   ▼
File System
```

这种设计可以让 Tool 不需要自己管理 Workspace 路径。

---

## 7. Agent

`Agent` 是整个项目的核心。

它负责：

1. 接收用户任务
2. 保存 Context
3. 调用 LLM
4. 判断是否存在 Function Call
5. 执行 Tool
6. 保存 Tool Result
7. 再次调用 LLM
8. 直到模型返回最终答案

核心循环：

```ts
for (
  let iteration = 0;
  iteration < maxIterations;
  iteration++
) {
  const response =
    await this.model.chat({
      messages:
        this.context.getItems(),
      tools: this.tools,
    });

  // Function Call
  // ↓
  // Execute Tool
  // ↓
  // Add Tool Result
}
```

默认最大循环次数：

```ts
maxIterations = 20
```

防止 Agent 因为异常情况无限调用 Tool。

### 自动检查与 Git checkpoint

如果 Workspace 位于 Git 仓库中，Agent 会在每次任务开始时创建临时 checkpoint。每批 Tool 执行完成后，Agent 会检查 checkpoint 以来的增量 diff，并将检查摘要加入下一轮 Context，供模型复核修改。

任务正常完成后 checkpoint 会自动释放；如果模型调用失败、Tool 执行抛出异常或超过最大循环次数，Agent 会自动 rollback 到任务开始前的状态。任务开始前用户已有的修改会被保留。

---

## 8. Context

`AgentContext` 负责保存 Agent 当前对话状态。

支持：

```text
SystemMessage
UserMessage
AssistantMessage
FunctionCall
FunctionCallOutput
```

完整流程：

```text
System
 ↓
User
 ↓
Assistant
 ↓
Function Call
 ↓
Function Call Output
 ↓
Assistant
 ↓
...
```

例如：

```text
User:
读取 src/index.ts

Assistant:
Function Call → read_file

Tool:
返回文件内容

Assistant:
根据文件内容继续分析
```

Context 会将这些信息全部保存下来，使下一次 LLM 请求能够看到之前的 Tool 调用和结果。

---

## 9. OpenAI Responses API

项目通过 `OpenAIModel` 对 OpenAI SDK 进行封装。

Agent 不直接依赖 OpenAI SDK，而是依赖：

```ts
ModelClient
```

接口：

```ts
export interface ModelClient {
  chat(params: {
    messages: ContextItem[];
    tools?: ToolDefinition[];
  }): Promise<ModelResponse>;
}
```

因此 Agent 与具体模型服务解耦。

当前实现：

```text
Agent
 ↓
ModelClient
 ↓
OpenAIModel
 ↓
OpenAI Responses API
```

未来可以替换成其他兼容实现：

```text
Agent
 │
 └── ModelClient
       ├── OpenAIModel
       ├── AzureOpenAIModel
       ├── ClaudeModel
       └── OtherModel
```

---

## 10. 环境变量

启动时可通过第一个命令行参数选择 provider，默认使用 `openai`。程序会加载对应的 `.env.<provider>` 文件：

```bash
pnpm dev -- openai
pnpm dev -- anthropic
pnpm dev -- gemini
```

例如 `.env.openai`：

```env
MODEL_PROVIDER=openai
MODEL_API_KEY=your_api_key
MODEL_BASE_URL=https://api.openai.com/v1
MODEL_NAME=gpt-5
```

Anthropic 和 Gemini 使用各自的 `.env.anthropic`、`.env.gemini` 文件，并填写相同的四个变量。

仓库通过 `.gitignore` 中的 `.env*` 规则忽略所有环境文件。若某个 `.env` 文件之前已经被 Git 跟踪，需要从索引移除，但不会删除本地文件：

```bash
git rm --cached --ignore-unmatch -- '.env*'
```

---

## 11. 安装

安装依赖：

```bash
pnpm install
```

或者：

```bash
npm install
```

---

## 12. 开发运行

开发模式：

```bash
pnpm dev
```

或者：

```bash
npm run dev
```

启动后：

```text
=================================
       Mini Codex Agent
=================================

Agent 已启动，可以开始提问。
输入 exit、quit 或 q 退出。
Workspace: D:\mini-codex\workspace

You:
```

---

## 13. TypeScript 类型检查

推荐开发过程中首先运行：

```bash
pnpm typecheck
```

或者：

```bash
npm run typecheck
```

用于检查 TypeScript 类型错误。

---

## 14. 构建

```bash
pnpm build
```

或者：

```bash
npm run build
```

构建后：

```text
dist/
```

---

## 15. 生产运行

```bash
pnpm start
```

或者：

```bash
npm start
```

---

## 16. 示例

启动：

```text
You: 列出当前工作区的文件
```

Agent：

```text
[Agent] iteration: 1
[Agent] tool: list_files
[Agent] arguments: {"path":"."}
```

Tool 返回文件列表后，Agent 继续处理。

---

### 创建文件

```text
You: 创建一个 hello.ts，内容是 console.log("Hello Mini Codex")
```

Agent 会：

```text
LLM
 ↓
write_file
 ↓
Workspace.resolve()
 ↓
workspace/hello.ts
 ↓
Tool Result
 ↓
LLM
 ↓
Final Answer
```

---

### 修改文件

```text
You: 把 hello.ts 里的 Hello Mini Codex 修改成 Hello World
```

Agent 会：

```text
read_file
   ↓
分析文件
   ↓
edit_file
   ↓
Tool Result
   ↓
Final Answer
```

---

### 执行命令

```text
You: 执行 node -v
```

Agent：

```text
run_command
```

命令执行目录：

```text
workspace/
```

---

## 17. 安全设计

目前主要通过 Workspace 实现文件访问隔离。

### 路径隔离

允许：

```text
workspace/src/index.ts
```

拒绝：

```text
../package.json
../../secret.txt
```

### 编辑保护

`edit_file` 要求 `oldText` 唯一匹配。

如果：

```text
oldText
```

出现多次，则拒绝修改。

### 命令执行

命令执行目前限制在：

```text
workspace/
```

作为工作目录。

> 注意：`run_command` 目前只是限制命令的工作目录，并不能阻止 Shell 命令本身访问 Workspace 外部资源。例如 Windows 下的命令仍然可能通过绝对路径访问其他目录。因此 `run_command` 当前不应被视为完整的操作系统级沙箱。

---

## 18. 当前版本能力

目前已经形成一个最小可运行的 Coding Agent：

```text
                 Mini Codex
                     │
          ┌──────────┴──────────┐
          │                     │
        Agent                 Tools
          │                     │
          │          ┌──────────┼───────────┐
          │          │          │           │
          ▼          ▼          ▼           ▼
        LLM       文件读取    文件修改     命令执行
          │          │          │           │
          └──────────┴──────────┴───────────┘
                     │
                  Workspace
                     │
                     ▼
                 File System
```

已经具备 Coding Agent 最核心的：

```text
理解任务
   ↓
规划
   ↓
调用 Tool
   ↓
读取结果
   ↓
继续调用 Tool
   ↓
完成任务
```

---

## 19. 后续可以继续扩展

在当前架构基础上，可以继续增加：

### Agent 能力

* Streaming 输出
* Tool Call 并行执行
* Context 压缩
* Token 管理
* 自动重试
* 最大执行时间
* Agent 状态事件
* Tool 执行日志

### Coding Agent 能力

* patch Tool
* 自动测试
* 自动修复 TypeScript 错误
* 自动运行 lint
* 自动运行 build
* 项目结构分析
* 代码搜索优化

### 安全能力

* Tool 权限控制
* 命令执行确认
* 危险命令拦截
* 文件修改确认
* 更严格的命令沙箱
* Workspace 权限策略

---

## 20. 项目目标

Mini Codex 的核心并不是简单地实现一个聊天机器人，而是构建一个最小化的 **AI Coding Agent Runtime**。

核心模型：

```text
LLM
 +
Context
 +
Tool Calling
 +
Workspace
 +
Tool Executor
 =
Coding Agent
```

通过不断扩展 Tool 和 Agent Runtime，可以逐步实现类似 Codex / Claude Code 的开发者 Agent 工作流。
