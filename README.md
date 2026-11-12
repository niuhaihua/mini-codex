# Mini Codex

Mini Codex 是一个使用 TypeScript、Node.js、LLM Tool Calling 和 Model Context Protocol（MCP）实现的轻量级 AI Coding Agent。

它通过自然语言接收开发任务，由 LLM 决定是否调用工具。工具可以来自两类来源：

- Native Tools：项目内置的 File、Git、Shell 工具。
- MCP Tools：由 MCP Server 提供的外部工具，目前已完成 GitHub MCP 接入。

Mini Codex 默认只允许文件工具访问项目根目录下的 `workspace/`，适合用作本地代码检查、修改、命令执行和 Git 辅助工具。

## 文档导航

- [安装](#安装)与[配置模型 Provider](#配置模型-provider)：准备运行环境和模型配置。
- [架构](#架构)与[Agent 上下文和工具协议](#agent-上下文和工具协议)：理解多轮任务的执行机制。
- [流式输出](#流式输出)：了解各 Provider 的支持情况和终端行为。
- [流式输出技术详解](docs/streaming.md)：事件处理、正文恢复、接口回退、测试与排错。
- [Git 自动保护](#git-自动保护)：checkpoint 的实现、作用范围和限制。
- [测试与验证](#测试与验证)：本地回归测试和真实接口验证。

## 功能概览

- 交互式 CLI
- 多轮 Agent Tool Calling
- 文件和目录浏览
- 文件读取、创建、覆盖、精确文本替换和删除
- 工作区文件内容搜索
- 在工作区根目录执行 Shell/CMD 命令
- Git status、diff、log 和 commit
- Git checkpoint、变更检查和 rollback
- OpenAI Responses API
- OpenAI-compatible Responses API
- OpenAI/兼容服务的 SSE 流式文本输出和 Chat Completions 条件回退
- Anthropic Messages API
- 通过 OpenAI Chat Completions 兼容接口接入 Gemini
- MCP 外部工具接入
- GitHub 官方 MCP Server
- TypeScript 类型检查和构建
- 流式输出回归测试与 CLI 端到端测试
- Node.js bundle 构建
- Windows x64 exe 打包

## 架构

当前项目的工具架构如下：

```text
                              ToolRegistry
                              /          \
                             /            \
                   Native Tools          MCP Tools
                  /       |       \       /       \
               File      Git     Shell  GitHub   Database
                                         MCP       MCP
                                           \       /
                                        McpClientManager
                                               |
                                           MCP Servers
```

目前已实现：

```text
ToolRegistry
├── Native Tools
│   ├── File
│   ├── Git
│   └── Shell
└── MCP Tools
    └── McpClientManager
        └── GitHub MCP
```

Database MCP 在架构上预留了扩展位置，但当前项目还没有内置 Database MCP Client。

### 一次任务的执行流程

```text
用户输入自然语言请求
        |
        v
Agent 保存 User Message
        |
        v
ModelClient 调用模型
        |
        +---- 没有 Tool Call ----> 返回最终答案
        |
        v
模型返回 Function Call
        |
        v
ToolRegistry 根据工具名称路由
        |
        +---- Native Tool ----> File / Git / Shell
        |
        +---- MCP Tool -------> McpClientManager
                                      |
                                      v
                              GitHub MCP Server
        |
        v
Tool Result 写回 Agent Context
        |
        v
再次调用模型，直到任务完成
```

Agent 默认最多执行 20 轮迭代。超过最大迭代次数时，Agent 会抛出错误，并尝试回滚本次任务创建的自动 Git checkpoint。

### 模块职责

| 模块 | 职责 | 关键接口 |
| --- | --- | --- |
| `src/index.ts` | 组装 Provider、Workspace、工具和 MCP；管理交互式终端 | `main()`、`activeTokenHandler` |
| `src/config.ts` | 选择环境文件、读取配置、校验必填项和超时 | `config` |
| `src/agent/agent.ts` | 执行模型/工具循环，维护每轮文本，管理 Git checkpoint | `Agent.run()` |
| `src/agent/context.ts` | 保存对话消息、工具请求和工具结果 | `AgentContext` |
| `src/llm/` | 将统一上下文转换为各模型接口格式，解析回复 | `ModelClient.chat()` |
| `src/tools/registry.ts` | 统一工具定义与执行路由 | `ToolRegistry` |
| `src/tools/mcp/` | MCP 连接、工具发现、名称映射和结果转换 | `McpClientManager`、`GitHubMcpClient` |
| `src/workspace/workspace.ts` | 解析文件路径并进行工作区路径检查 | `Workspace.resolve()` |

## Agent 上下文和工具协议

模型适配层对 Agent 暴露统一接口，CLI 不直接消费模型供应商的原始事件：

```ts
interface ModelClient {
  chat(params: {
    messages: ContextItem[];
    tools?: ToolDefinition[];
    onToken?: (token: string) => void;
  }): Promise<ModelResponse>;
}

interface ModelResponse {
  content: string | null;
  functionCalls: FunctionCall[];
}
```

`onToken` 用于及时显示增量文本，返回的 `content` 用于保存完整正文。这里的 `token` 是字符串片段，不保证等于模型分词器中的一个 token，也不保证是完整句子。

`AgentContext` 保存以下五类数据：

| 类型 | 用途 |
| --- | --- |
| `system` | 系统提示词；默认来自 `src/agent/prompt.ts` |
| `user` | 用户问题，也包括自动 Git 变更检查报告 |
| `assistant` | 每次模型调用返回的非空正文 |
| `function_call` | 工具名称、JSON 参数字符串和 `call_id` |
| `function_call_output` | 通过 `call_id` 与请求对应的字符串结果 |

执行规则：

1. 每次 `run()` 追加用户消息，并尝试创建自动 checkpoint。
2. 每次迭代将当前上下文和工具定义发送给模型。
3. 模型有工具调用时，先保存所有调用，再按返回顺序逐个执行；当前没有并行工具执行。
4. 工具参数必须能解析为 JSON 对象，数组、`null` 和非法 JSON 会返回错误结果。当前没有通用的运行时 JSON Schema 校验器；具体参数校验还依赖各工具实现。
5. 工具结果写回上下文，供下一轮模型判断。`read_file` 返回文件原文，其他很多工具返回 JSON 字符串，结果不要求统一是 JSON。
6. 模型没有工具调用且存在非空正文时，结束任务；正文和工具调用都为空时抛出明确错误。

单个工具抛出的异常通常会被转换为包含 `success: false`、`error`、工具名称和 `call_id` 的结果，模型可以继续修正参数。工具失败不等于整个任务立即失败。

同一个 CLI 进程会复用 Agent，因此后续问题继承上下文。目前上下文只保存在内存中，没有持久化、自动摘要或 token 预算裁剪。`Agent.reset()` 可在代码中清空上下文，CLI 尚未提供 reset 命令；重启程序会开始新会话。

## 环境要求

- Node.js 22 或更高版本
- pnpm 10，或 npm
- 至少一个模型 provider 的 API Key
- 使用 Git 工具时需要安装 Git，并确保其位于 `PATH` 中
- 如果使用 GitHub MCP：
  - 远程 HTTP 模式需要 GitHub Personal Access Token
  - stdio 模式需要 Docker 或其他可启动 MCP Server 的命令

## 安装

使用 pnpm：

```bash
pnpm install
```

也可以使用 npm：

```bash
npm install
```

项目声明的包管理器版本是：

```text
pnpm@10.32.1
```

安装后，在启动目录中创建 `workspace/`，准备 `.env.openai`，再运行 `pnpm dev`。可在 `workspace/output.txt` 中放入几行测试文本，然后输入 `读取output.txt内容`，验证文件工具和模型回答的完整流程。

## 配置模型 Provider

启动命令的第一个非选项参数用于选择 provider。如果不传参数，默认使用 `openai`。

```bash
pnpm dev -- openai
pnpm dev -- openai-compatible
pnpm dev -- anthropic
pnpm dev -- gemini
```

程序会加载对应的环境文件：

```text
.env.openai
.env.openai-compatible
.env.anthropic
.env.gemini
```

例如，使用 OpenAI：

```env
MODEL_PROVIDER=openai
MODEL_API_KEY=your_api_key
MODEL_BASE_URL=https://api.openai.com/v1
MODEL_NAME=gpt-5
MODEL_TIMEOUT_MS=600000
```

### 模型环境变量

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `MODEL_PROVIDER` | 是 | 无 | `openai`、`openai-compatible`、`anthropic` 或 `gemini` |
| `MODEL_API_KEY` | 是 | 无 | 模型服务 API Key |
| `MODEL_BASE_URL` | 是 | 无 | 模型服务 Base URL |
| `MODEL_NAME` | 是 | 无 | 模型名称 |
| `MODEL_TIMEOUT_MS` | 否 | `600000` | 请求超时时间，单位为毫秒 |

当前 `src/config.ts` 会对 `MODEL_PROVIDER`、`MODEL_API_KEY`、`MODEL_BASE_URL` 和 `MODEL_NAME` 做必填校验。如果配置文件不存在，程序会在启动阶段直接报错。

配置加载有几个容易混淆的细节：

- 命令行参数选择的是环境文件名；实际实例化哪个客户端，由文件中的 `MODEL_PROVIDER` 决定。建议两者保持一致。
- 环境文件相对于 `process.cwd()` 查找，不是相对于源码或可执行文件路径查找。
- 当前只显式加载 `.env.<provider>`，不会自动合并项目根目录的 `.env`。
- `dotenv` 使用 `override: true`，文件中出现的变量会覆盖进程中同名环境变量；文件未设置的变量仍可来自进程环境。
- `MODEL_TIMEOUT_MS` 必须是有限的正数。它传入模型 SDK，默认 600000 毫秒；它不是整次 Agent 任务的总时限，也不控制 Shell/Git 工具超时。
- 下方模型名称为配置格式示例，实际名称应以所用服务支持的模型为准。

### Provider 说明

#### `openai`

使用 OpenAI Responses API：

```text
Agent -> OpenAIModel -> OpenAI Responses API
```

示例：

```env
MODEL_PROVIDER=openai
MODEL_API_KEY=your_openai_api_key
MODEL_BASE_URL=https://api.openai.com/v1
MODEL_NAME=gpt-5
```

#### `openai-compatible`

优先使用 OpenAI Responses API，与 `openai` 共用 `OpenAIModel`。流式模式在满足特定条件时回退到 Chat Completions；并非任何上游错误都会回退，详见[流式输出](#流式输出)。

```env
MODEL_PROVIDER=openai-compatible
MODEL_API_KEY=your_api_key
MODEL_BASE_URL=https://your-compatible-service.example/v1
MODEL_NAME=your-model
```

#### `anthropic`

使用 Anthropic Messages API：

```env
MODEL_PROVIDER=anthropic
MODEL_API_KEY=your_anthropic_api_key
MODEL_BASE_URL=https://api.anthropic.com
MODEL_NAME=claude-sonnet-4-5
```

#### `gemini`

当前 Gemini 客户端通过 OpenAI Chat Completions 兼容接口工作，因此 `MODEL_BASE_URL` 必须指向一个提供 `/chat/completions` 的兼容端点：

```env
MODEL_PROVIDER=gemini
MODEL_API_KEY=your_gemini_api_key
MODEL_BASE_URL=https://your-gemini-compatible-service.example/v1
MODEL_NAME=gemini-2.5-pro
```

## 流式输出

CLI 创建 Agent 时传入 `onToken`，OpenAI 适配器据此设置 `stream: true`。收到文本片段后，通过 `process.stdout.write()` 立即输出，避免等待整段回答完成。

### 当前支持范围

| `MODEL_PROVIDER` | 首选接口 | 当前模型文本输出方式 |
| --- | --- | --- |
| `openai` | Responses | SSE 流式输出；满足条件时回退到流式 Chat Completions |
| `openai-compatible` | Responses | 与 `openai` 使用相同实现；实际取决于兼容服务能力 |
| `anthropic` | Messages | 当前为非流式请求，Agent 在返回后一次性显示正文 |
| `gemini` | Chat Completions 兼容接口 | 当前为非流式请求，Agent 在返回后一次性显示正文 |

### “读取 output.txt”的输出过程

```text
You: 读取output.txt内容
  -> 模型流返回 read_file({"path":"output.txt"})
  -> 工具读取 <启动目录>/workspace/output.txt
  -> 文件原文写入 function_call_output
  -> 再次请求模型
  -> 收到文本增量后逐段打印 Agent 回答
```

工具参数片段不会作为回答显示，工具执行也不等于直接把文件内容打印到终端；通常需要第二次模型请求将工具结果组织成答案。模型可能先返回一句说明再调用工具，这句说明也会显示。

### 关键处理规则

- 终端等待首个非空白文本后才打印 `Agent:`；空字符串被忽略，起始空白先缓存。
- Responses 的原始结束事件不保证包含 SDK 便利字段 `output_text`，因此会从 `output[].content[]` 提取正文，并保留已收到的增量文本。
- Agent 按每次模型调用记录已显示文本。如果最终正文以已显示文本为前缀，只补发剩余部分，避免重复输出，也避免前一轮的工具说明遮住最后一轮答案。
- 只有在尚未回调任何非空字符串，且 Responses 返回空流/空结果，或 HTTP 状态为 `404`、`405`、`501` 时，流式分支才回退到 Chat Completions。仅含空白的非空字符串也会阻止这次回退。
- `response.failed`、`response.incomplete`、流错误和输出后的断流会报告错误。已显示文本不会从终端撤回，不应把这部分文本视为成功完成的回答。
- `run_command` 收集完 `stdout`/`stderr` 才返回；模型正文流式输出不意味着 Shell 工具日志也实时流式输出。

事件字段、结束判定、回退策略与回归测试详见[流式输出技术详解](docs/streaming.md)。

## Workspace

Agent 的文件工具和命令工具围绕 `workspace/` 工作目录运行：

```text
mini-codex/
├── src/
├── workspace/
├── package.json
└── README.md
```

运行时，工作区根目录解析为：

```text
<启动时的当前工作目录>/workspace
```

如果用户要求读取：

```json
{
  "path": "src/index.ts"
}
```

实际访问路径是：

```text
<启动时的当前工作目录>/workspace/src/index.ts
```

### 路径隔离

文件工具通过 `Workspace.resolve()` 将相对路径解析到工作区根目录，并拒绝越过工作区的路径：

```text
允许：
src/index.ts
packages/app/package.json

拒绝：
../package.json
../../secret.txt
```

运行前请确认：

1. `workspace/` 目录存在。
2. 需要 Agent 操作的项目位于 `workspace/` 内。
3. 不要把 API Key 或其他敏感文件放入会被 Agent 读取的工作区，除非这是明确需求。

路径检查基于 `path.resolve()` 和 `path.relative()`，并未通过 `realpath()` 检查符号链接或 Windows junction 的最终目标，因此它是路径层面的限制，不是完整的文件系统沙箱。

## ToolRegistry

`ToolRegistry` 是 Agent 唯一使用的工具入口，负责两件事：

1. 汇总所有工具定义，交给 LLM。
2. 根据工具名称路由实际执行逻辑。

注册流程如下：

```text
createNativeToolsets(workspace)
        |
        v
ToolRegistry.registerNativeTools(...)
        |
        v
GitHubMcpClient.connect()
        |
        v
McpClientManager.registerServer(...)
        |
        v
ToolRegistry.registerMcpManager(...)
        |
        v
Agent({
  tools: toolRegistry.getDefinitions(),
  toolExecutor: toolRegistry
})
```

Native Tool 和 MCP Tool 都转换为统一的 `ToolDefinition`：

```ts
interface ToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: JsonSchema;
  strict?: boolean;
}
```

当 Agent 执行工具时：

```text
Agent
  -> ToolRegistry.execute(name, args)
  -> Native Tool 或 McpClientManager
  -> 返回字符串结果
```

ToolRegistry 会拒绝重复工具名称，避免不同工具覆盖同一个路由。

## Native Tools

Native Tools 位于：

```text
src/tools/native/
```

它们分为三个类别：

### File

| Tool | 说明 |
| --- | --- |
| `list_files` | 列出目录中的文件和子目录 |
| `read_file` | 读取文件内容 |
| `write_file` | 创建或覆盖文件 |
| `edit_file` | 替换文件中唯一匹配的文本 |
| `delete_file` | 删除文件 |
| `search_files` | 搜索工作区文件内容 |

### Git

| Tool | 说明 |
| --- | --- |
| `git_status` | 查看当前分支和工作区状态 |
| `git_diff` | 查看 unstaged 或 staged diff |
| `git_log` | 查看最近的 Git 提交 |
| `git_commit` | 提交已暂存的修改 |
| `git_checkpoint` | 创建当前 Git 状态的 checkpoint |
| `git_rollback` | 恢复指定 checkpoint |

### Shell

| Tool | 说明 |
| --- | --- |
| `run_command` | 在 `workspace/` 根目录执行命令 |

当前本地工具定义由 `src/tools/native/tool.ts` 提供，再由 `src/tools/native/native.ts` 按 File、Git、Shell 分类。

当前向模型公开 13 个 Native Tools。另有 `git_checkpoint_inspect` 和 `git_checkpoint_discard` 两个内部工具，只注册执行函数，不加入模型可见的工具定义，用于 Agent 的生命周期管理。

### 搜索与命令执行细节

`search_files` 使用区分大小写的 `line.includes(keyword)` 做逐行子串匹配，不是正则搜索。它只搜索代码中列出的文本扩展名，跳过 `node_modules`、`.git`、`dist`、`build`、`.next` 和 `.nuxt`，不会完整解析 `.gitignore`。结果包含相对搜索根目录的路径、从 1 开始的行号和去除首尾空白的行文本。

`run_command` 在 Windows 上使用 `cmd.exe`，其他平台使用 `/bin/bash`。即使你从 PowerShell 启动 CLI，模型执行的命令默认仍按 CMD 语法解析。命令超时为 120000 毫秒，输出缓冲限制为 10 MiB；Git 命令封装也使用这两个限制。Git 通过 `execFile("git", args)` 传递参数，Shell 工具则通过 `exec()` 执行命令字符串。

### `edit_file` 的唯一匹配规则

`edit_file` 要求 `oldText` 在目标文件中恰好出现一次：

- 出现 0 次：工具返回未找到错误。
- 出现 1 次：执行替换。
- 出现多次：工具拒绝修改，避免修改错误位置。

### `git_commit` 的暂存规则

`git_commit` 不会自动执行 `git add`。它只提交已经 staged 的内容，因此模型或用户需要先执行：

```bash
git add <files>
```

之后再调用：

```text
git_commit
```

## MCP 架构

MCP 相关代码位于：

```text
src/tools/mcp/
```

### `McpToolProvider`

所有 MCP Server 都可以通过统一接口接入：

```ts
interface McpToolProvider {
  getToolDefinitions(): ToolDefinition[];
  execute(name: string, args: ToolArguments): Promise<string>;
  close(): Promise<void>;
}
```

这个接口隔离了 MCP Server 的具体连接方式。Provider 可以使用：

- Streamable HTTP
- stdio
- 其他 MCP SDK 支持的 transport

### `McpClientManager`

`McpClientManager` 管理多个 MCP Server：

```ts
mcpManager.registerServer({
  name: "github",
  provider: githubMcp,
});
```

它负责：

- 保存 Server 名称和 Provider 的关系。
- 收集每个 Server 的工具定义。
- 将工具名称映射到对应 Provider。
- 转发工具调用。
- 在 CLI 退出时关闭所有 MCP 连接。
- 拒绝重复的 Server 名称和工具名称。

未来接入 Database MCP 时，目标结构为：

```ts
mcpManager.registerServer({
  name: "database",
  provider: databaseMcp,
});
```

## GitHub MCP

当前已实现 GitHub MCP Client，支持两种连接方式：

1. GitHub 官方远程 Streamable HTTP。
2. 本地命令启动的 stdio MCP Server，例如 Docker。

GitHub MCP 的远程工具会加上 `mcp_github_` 前缀，避免和 Native Tool 重名。

连接后会调用 `tools/list`，再按允许列表筛选。默认仅选择 `search_repositories`、`search_code`、`search_issues` 和 `get_repository`；最终可用工具还取决于服务端实际返回的列表。可通过 `MCP_GITHUB_TOOLS` 指定逗号分隔的远程工具名，配置时不要添加 `mcp_github_` 前缀：

```env
MCP_GITHUB_TOOLS=search_repositories,search_code,search_issues,get_repository,get_file_contents
```

显式配置会替换默认列表，不会自动与默认列表合并。客户端会缩短工具描述，并递归去除输入 Schema 的 `description` 字段，减少发送给模型的描述文本。MCP 返回的文本内容会合并到 `output`，保留 `structuredContent`，并根据 `isError` 设置 `success` 和 `error`。

例如远程工具：

```text
get_file_contents
```

在 Mini Codex 中会暴露为：

```text
mcp_github_get_file_contents
```

### 远程 HTTP 模式

GitHub 官方远程 MCP 地址：

```text
https://api.githubcopilot.com/mcp/
```

在当前 provider 对应的 `.env.<provider>` 中加入：

```env
MCP_GITHUB_ENABLED=true
MCP_GITHUB_TRANSPORT=http
MCP_GITHUB_URL=https://api.githubcopilot.com/mcp/
GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_your_token
```

启动：

```bash
pnpm dev -- openai-compatible
```

启动过程：

```text
读取 .env.openai-compatible
        |
        v
创建 GitHubMcpClient
        |
        v
连接 GitHub MCP HTTP Server
        |
        v
调用 tools/list
        |
        v
转换为 mcp_github_* ToolDefinition
        |
        v
注册到 McpClientManager
```

### Docker stdio 模式

GitHub 官方 MCP Server 也可以通过 Docker 启动：

```env
MCP_GITHUB_ENABLED=true
MCP_GITHUB_TRANSPORT=stdio
MCP_GITHUB_COMMAND=docker
MCP_GITHUB_ARGS=["run","-i","--rm","-e","GITHUB_PERSONAL_ACCESS_TOKEN","ghcr.io/github/github-mcp-server"]
GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_your_token
```

要求：

- Docker 已安装。
- Docker daemon 正在运行。
- 可以拉取或已经拥有 `ghcr.io/github/github-mcp-server` 镜像。
- `MCP_GITHUB_ARGS` 是合法的 JSON 字符串数组。

Mini Codex 会启动 Docker 子进程，通过 stdio 与 GitHub MCP Server 通信。退出 CLI 时会关闭 MCP Client。

### GitHub MCP 环境变量

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `MCP_GITHUB_ENABLED` | 否 | 不启用 | 设置为 `true` 才启用 GitHub MCP |
| `MCP_GITHUB_TRANSPORT` | 否 | `http` | 支持 `http` 或 `stdio` |
| `MCP_GITHUB_URL` | 否 | `https://api.githubcopilot.com/mcp/` | HTTP MCP Server 地址 |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | HTTP 必填 | 无 | 以 Bearer Token 方式发送 |
| `MCP_GITHUB_COMMAND` | stdio 必填 | 无 | MCP Server 启动命令，例如 `docker` |
| `MCP_GITHUB_ARGS` | 否 | 无 | 启动参数，必须是 JSON 字符串数组 |
| `MCP_GITHUB_CWD` | 否 | 当前进程目录 | stdio Server 工作目录 |
| `MCP_GITHUB_TOOLS` | 否 | 默认四个工具 | 逗号分隔的远程工具名；替换默认允许列表 |

当前代码只会在 `MCP_GITHUB_ENABLED=true` 时初始化 GitHub MCP。没有启用 MCP 时，Native Tools 可以单独运行。

### Token 安全建议

- 不要把真实 GitHub Token 提交到 Git。
- 使用权限尽可能小的 GitHub Token。
- 不要在 README、代码或日志中打印 Token。
- HTTP 和 stdio 模式都通过环境变量传递 Token。
- 如果 Token 泄漏，应立即在 GitHub 中撤销并重新生成。

## Git 自动保护

如果 `workspace/` 位于 Git 仓库中，Agent 会在每次任务开始时尝试创建自动 checkpoint。

每批工具执行后，Agent 会检查 checkpoint 之后的变化，并将检查结果写入后续上下文，使模型可以看到自己刚才造成的修改。

### 正常完成

```text
任务开始
  -> 创建自动 checkpoint
  -> 执行工具
  -> 检查变化
  -> 返回最终答案
  -> 释放 checkpoint
```

### 异常完成

以下情况会触发自动 rollback：

- 模型请求失败。
- 从 Agent 主循环向外传播的未处理异常。
- Agent 超过最大迭代次数。
- 流式响应失败、中断，或模型最终没有正文也没有工具调用。

```text
任务开始
  -> 创建自动 checkpoint
  -> 执行工具
  -> 发生异常
  -> rollback 到任务开始前
```

任务开始前已经存在的 staged、unstaged 和 untracked 文件会被保留。Git checkpoint 不可用时，Agent 会记录警告并继续执行，但不会获得自动回滚保护。

### Checkpoint 的实现与边界

1. 用 `git rev-parse --show-toplevel` 确定仓库根目录，并记录当前 `HEAD`。没有初始提交的仓库无法解析 `HEAD`，checkpoint 会不可用。
2. 用 `git stash create` 保存 tracked 文件的状态，不执行通常会清空工作树的 `git stash push`。
3. 用 `git ls-files --others --exclude-standard` 枚举未跟踪文件，将文件内容保存在当前进程的内存中。
4. 检查变化时，比较 checkpoint 基线与当前工作树，并比较未跟踪文件内容；写回模型上下文的报告最多取 50000 个字符。
5. 回滚时，按顺序执行 `git reset --hard <原HEAD>`、`git clean -fd`、必要时 `git stash apply --index`，再恢复保存的未跟踪文件。
6. 任务成功后删除内存中的自动 checkpoint 记录；进程退出后 checkpoint ID 不再可用，它不是持久化备份。

checkpoint 的范围是 Git 仓库根目录，不一定等于 `workspace/`。如果 `workspace/` 属于上级仓库，回滚会作用于上级整个仓库，任务期间其他进程或人工产生的修改也可能受影响。更容易控制的方式是让需要 Agent 修改的项目拥有独立仓库。

被 Git 忽略且未跟踪的文件不会被快照或 `git clean -fd` 覆盖。当前 `.gitignore` 忽略 `workspace`，所以仅在上级仓库创建 checkpoint，并不能保护其中未跟踪的工作文件。checkpoint 也不能撤销远程 MCP 操作、网络请求或 Shell 对仓库外文件的修改。

单个工具返回 `success: false` 或被捕获成错误结果时，Agent 通常继续迭代；只有异常传播到 `run()` 的外层处理才尝试自动回滚。回滚自身失败会打印警告，不能把出现 checkpoint 日志理解为一定完成了恢复。

## 开发和运行

### 开发模式

默认使用 `openai`：

```bash
pnpm dev
```

指定 provider：

```bash
pnpm dev -- openai-compatible
pnpm dev -- anthropic
pnpm dev -- gemini
```

### CLI

启动后会看到：

```text
=================================
       Mini Codex Agent
=================================

You:
```

输入自然语言任务，例如：

```text
You: 列出当前工作区的文件
You: 找出所有使用 fetch 的 TypeScript 文件
You: 创建一个 hello.ts 文件
You: 检查当前 Git 修改
You: 查看 GitHub 仓库最近的 issue
```

输入以下任意命令退出：

```text
exit
quit
q
```

## 类型检查、构建和打包

### 类型检查

```bash
pnpm typecheck
```

执行 `tsc --noEmit`，不会生成编译产物。

### TypeScript 构建

```bash
pnpm build
```

输出到：

```text
dist/
```

### 清理并重新构建

```bash
pnpm rebuild
```

该命令依次执行：

```text
pnpm clean
pnpm build
```

### 生产模式运行

```bash
pnpm start
```

等价于：

```bash
node dist/index.js
```

生产构建默认也选择 `openai`。使用其他环境文件时，从命令行指定，例如：

```bash
node dist/index.js openai-compatible
```

### Node.js Bundle

```bash
pnpm bundle
```

输出：

```text
dist/bundle.cjs
```

### Windows exe

```bash
pnpm build:exe
```

该命令会依次执行：

```text
pnpm build
pnpm bundle
pnpm exec pkg dist/bundle.cjs --targets node22-win-x64
```

输出：

```text
release/mini-codex.exe
```

从 exe 所在目录启动的部署布局示例：

```text
mini-codex.exe
workspace/
.env.openai-compatible
```

如果启用 GitHub MCP，`.env.openai-compatible` 中还需要包含对应的 MCP 配置。

上述配置对应的 PowerShell 启动命令为 `./mini-codex.exe openai-compatible`。环境文件和 `workspace/` 都相对于启动时的当前目录解析；从其他目录启动时，不会自动改为查找 exe 所在目录。

## 测试与验证

```bash
pnpm test
pnpm typecheck
pnpm build
```

`pnpm test` 使用 Node.js 内置测试框架，通过 `tsx` 直接加载 TypeScript 源码，脚本为 `node --import tsx --test tests/*.test.mjs`。本地测试文件是 `tests/streaming.test.mjs`，目前包含 12 项测试，不需要真实模型 API Key。

| 验证范围 | 验证内容 |
| --- | --- |
| 增量时序 | 在模型请求结束前就收到文本回调 |
| Responses 解析 | 结束事件缺少 `output_text` 时仍能恢复正文；结束事件不覆盖已有增量 |
| 工具循环 | 正确传递 `read_file` 的 `call_id` 和结果，显示工具调用后的最终回答 |
| 接口回退 | 空流与 404 的回退；Chat 文本流与分段工具 JSON 参数拼接 |
| 异常 | failed、incomplete、error、部分输出后断流、空答案 |
| 输出补齐 | 非流式结果仍可显示，不因前一轮已经输出而遗漏 |
| CLI 端到端 | 临时目录中实际读取 `output.txt`，并证明终端在服务端结束前显示首段文本；最终正文只显示一次 |

CLI 测试启动本地 HTTP 服务和真实 CLI 子进程：服务端发送第一段后，必须等到子进程 stdout 出现该段，才发送剩余内容。这验证了输出时序，而不只是最终字符串相等。测试临时环境使用假密钥，结束后清理临时资源。

当前 `.gitignore` 包含 `tests`，这些本地测试文件不会被普通 `git add` 自动纳入版本控制；新克隆环境可能没有测试文件。共享测试前需调整该忽略规则或显式纳入文件。本说明不改变当前忽略配置。

真实接口验证需要单独运行 `pnpm dev`，先测试简单文本回答，再测试 `读取output.txt内容`。本地测试通过可以证明解析与输出链路正常，但不代表配置中的模型服务一定支持工具调用或持续可用。详细步骤和历史验证范围见[流式输出技术详解](docs/streaming.md#验证方法)。

## 项目结构

```text
mini-codex/
├── src/
│   ├── agent/
│   │   ├── agent.ts          # Agent 主循环、Tool Call 执行和 Git 自动保护
│   │   ├── context.ts        # 对话上下文和 Function Call 结果
│   │   └── prompt.ts         # Agent 系统提示词
│   ├── llm/
│   │   ├── types.ts          # ModelClient、ToolDefinition 等类型
│   │   ├── openai.ts         # OpenAI Responses API Client
│   │   ├── anthropic.ts      # Anthropic Messages API Client
│   │   └── gemini.ts         # OpenAI Chat Completions 兼容 Client
│   ├── tools/
│   │   ├── registry.ts       # ToolRegistry，统一工具注册和执行
│   │   ├── native/
│   │   │   ├── index.ts      # Native Tools 导出入口
│   │   │   ├── native.ts     # File/Git/Shell 工具分类和组装
│   │   │   ├── tool.ts       # Native Tool Definition 和函数注册
│   │   │   ├── listFiles.ts  # 文件工具
│   │   │   ├── readFile.ts
│   │   │   ├── writeFile.ts
│   │   │   ├── editFile.ts
│   │   │   ├── deleteFile.ts
│   │   │   ├── searchFiles.ts
│   │   │   ├── runCommand.ts # Shell 工具
│   │   │   ├── git*.ts       # Git 工具和 checkpoint 实现
│   │   │   └── ...
│   │   └── mcp/
│   │       ├── index.ts      # MCP 导出入口
│   │       ├── types.ts      # McpToolProvider 接口
│   │       ├── manager.ts    # McpClientManager
│   │       └── github.ts     # GitHub MCP HTTP/stdio Client
│   ├── workspace/
│   │   └── workspace.ts      # 路径解析和工作区隔离
│   ├── config.ts             # provider 和环境变量加载
│   └── index.ts              # CLI 入口和依赖组装
├── workspace/                # Agent 默认工作目录
├── docs/
│   └── streaming.md          # 流式事件、回退、异常和验证方法
├── tests/
│   └── streaming.test.mjs    # 本地流式与 CLI 测试（当前被 Git 忽略）
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
└── README.md
```

## 扩展 Native Tool

新增本地工具通常需要以下步骤：

1. 在 `src/tools/native/` 下创建工具实现文件。
2. 在 `src/tools/native/tool.ts` 的 `createToolRegistry()` 中注册执行函数。
3. 在 `toolDefinitions` 中添加对应的 JSON Schema。
4. 在 `src/tools/native/native.ts` 中把工具加入 File、Git 或 Shell 分类。
5. 运行类型检查和构建。

示例结构：

```ts
export const myTool = async (
  args: ToolArguments,
): Promise<string> => {
  return JSON.stringify({
    success: true,
    value: args,
  });
};
```

工具名称必须全局唯一，否则 `ToolRegistry` 会拒绝注册。

模型适配器扩展时，应同时满足 `ModelClient` 的两个输出通道：及时调用 `onToken`，并在 Promise 完成时返回完整 `content` 和 `functionCalls`。工具调用必须等参数收集完整后交给 Agent，不能把参数 JSON 当作回答文本输出。新增实现应覆盖纯文本、工具调用后续回答、空响应和中途失败四类行为。

本项目采用 ESM（`"type": "module"`）和 TypeScript `nodenext`。源码中的相对导入通常使用 `.js` 后缀，对应构建后模块路径；类型导入使用 `import type`。`strict`、`noUncheckedIndexedAccess` 和 `exactOptionalPropertyTypes` 已开启，可选配置通常通过条件展开传入，避免把显式 `undefined` 当作不存在的属性。

## 扩展 MCP Server

新增 MCP Server 时，实现 `McpToolProvider`：

```ts
import type { ToolArguments } from "../../agent/agent.js";
import type { ToolDefinition } from "../../llm/types.js";
import type { McpToolProvider } from "./types.js";

export class DatabaseMcpClient implements McpToolProvider {
  getToolDefinitions(): ToolDefinition[] {
    return [];
  }

  async execute(
    name: string,
    args: ToolArguments,
  ): Promise<string> {
    return JSON.stringify({
      success: true,
      name,
      args,
    });
  }

  async close(): Promise<void> {}
}
```

然后在 `src/index.ts` 中注册：

```ts
const databaseMcp = new DatabaseMcpClient();

mcpManager.registerServer({
  name: "database",
  provider: databaseMcp,
});
```

注意：

- MCP 工具名称必须避免和 Native Tool 重名。
- 推荐给不同 MCP Server 的工具加前缀，例如 `mcp_database_`。
- Provider 的 `close()` 必须释放网络连接、子进程或其他资源。
- 外部 MCP Tool 的参数 Schema 必须准确，否则模型可能生成无效参数。

## 安全边界

- 文件工具通过 `Workspace.resolve()` 限制相对路径。
- `run_command` 的当前工作目录固定为 `workspace/`。
- 工作目录限制不等于完整的 Shell 沙箱；命令仍可能通过绝对路径访问工作区外资源。
- `git_commit` 只提交 staged 内容，不会自动暂存全部修改。
- GitHub MCP 权限取决于 GitHub Token 的权限范围。
- MCP Server 可以拥有独立于本地文件工具的访问能力，启用前应检查 Server 来源和权限。
- 不要提交 `.env*` 文件、API Key 或 GitHub Token。

## 常见问题

### 启动时报 `.env.<provider>` 不存在

确认命令中的 provider 和环境文件名称一致：

```bash
pnpm dev -- openai-compatible
```

对应文件必须是：

```text
.env.openai-compatible
```

### 报 `MODEL_BASE_URL` 缺失

当前配置加载逻辑将 `MODEL_BASE_URL` 视为必填变量，请在对应的 `.env.<provider>` 中填写。

### GitHub MCP 没有启动

确认：

```env
MCP_GITHUB_ENABLED=true
```

并检查：

- HTTP 模式是否设置 `GITHUB_PERSONAL_ACCESS_TOKEN`。
- stdio 模式是否设置 `MCP_GITHUB_COMMAND`。
- `MCP_GITHUB_ARGS` 是否是合法 JSON 数组。
- Docker 是否正在运行。

### GitHub MCP 工具没有出现在模型工具列表

GitHub MCP 工具只有在启动时连接成功并完成 `tools/list` 后才会注册。查看启动日志中是否出现：

```text
[MCP] GitHub connected: <selected> of <total> tools available.
```

同时检查 `MCP_GITHUB_TOOLS`：服务端提供工具不等于客户端允许列表中包含该工具。

### `Agent:` 后没有正文或长时间等待

先查看完整日志。`[OpenAI] sending request...` 只表示请求开始；模型尚未产生正文、正在生成工具调用或接口没有及时推送事件时，终端不会显示回答。工具调用后还需要一次模型请求。

如果服务只在结束事件返回正文，客户端会补发完整文本，但无法把上游没有实时发送的内容变成真正的流式输出。空答案、`response.failed`、`response.incomplete` 和断流现在会报错，详见[排错指南](docs/streaming.md#排错指南)。

### `Service temporarily unavailable` 或 `upstream error`

这是上游模型服务返回的失败信息，单纯修改终端输出逻辑不能修复。可保留错误中的 request ID，在服务恢复后重试，并分别检查纯文本请求与带工具请求。当前流式分支不会因为任意服务错误都切换接口，以免重复或混合答案。

### `读取output.txt内容` 提示找不到文件

检查启动日志中的 `Workspace:` 路径。目标文件应位于该目录内的 `output.txt`，而不是 Mini Codex 源码目录中的同名文件。通过其他目录启动程序会改变工作区位置。

### 测试启动时报 `uv_os_get_passwd` / `ENOMEM`

在受限 Windows 执行环境中，`tsx` 获取系统用户信息可能失败；单凭此错误不能认定机器内存不足。先在具备正常用户信息访问权限的终端复现，区分测试运行环境问题与项目测试断言失败。

### `edit_file` 拒绝修改

读取目标文件，确认 `oldText` 在文件中只出现一次。出现多次时，应缩小匹配文本或改用更具体的上下文。

## 许可证

项目当前使用 ISC License，具体以 `package.json` 为准。
