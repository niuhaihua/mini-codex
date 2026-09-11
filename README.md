# Mini Codex

Mini Codex 是一个使用 TypeScript、Node.js、LLM Tool Calling 和 Model Context Protocol（MCP）实现的轻量级 AI Coding Agent。

它通过自然语言接收开发任务，由 LLM 决定是否调用工具。工具可以来自两类来源：

- Native Tools：项目内置的 File、Git、Shell 工具。
- MCP Tools：由 MCP Server 提供的外部工具，目前已完成 GitHub MCP 接入。

Mini Codex 默认只允许文件工具访问项目根目录下的 `workspace/`，适合用作本地代码检查、修改、命令执行和 Git 辅助工具。

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
- Anthropic Messages API
- 通过 OpenAI Chat Completions 兼容接口接入 Gemini
- MCP 外部工具接入
- GitHub 官方 MCP Server
- TypeScript 类型检查和构建
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

## 环境要求

- Node.js 22 或更高版本
- pnpm 10，或 npm
- 至少一个模型 provider 的 API Key
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

使用 OpenAI Responses API 格式，适合兼容该接口的第三方模型服务。

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
<项目根目录>/workspace
```

如果用户要求读取：

```json
{
  "path": "src/index.ts"
}
```

实际访问路径是：

```text
<项目根目录>/workspace/src/index.ts
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
| `MCP_GITHUB_ENABLED` | 是 | `false` | 必须为 `true` 才启用 GitHub MCP |
| `MCP_GITHUB_TRANSPORT` | 否 | `http` | 支持 `http` 或 `stdio` |
| `MCP_GITHUB_URL` | 否 | `https://api.githubcopilot.com/mcp/` | HTTP MCP Server 地址 |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | HTTP 必填 | 无 | 以 Bearer Token 方式发送 |
| `MCP_GITHUB_COMMAND` | stdio 必填 | 无 | MCP Server 启动命令，例如 `docker` |
| `MCP_GITHUB_ARGS` | 否 | 无 | 启动参数，必须是 JSON 字符串数组 |
| `MCP_GITHUB_CWD` | 否 | 当前进程目录 | stdio Server 工作目录 |

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
- 工具执行抛出异常。
- Agent 超过最大迭代次数。

```text
任务开始
  -> 创建自动 checkpoint
  -> 执行工具
  -> 发生异常
  -> rollback 到任务开始前
```

任务开始前已经存在的 staged、unstaged 和 untracked 文件会被保留。Git checkpoint 不可用时，Agent 会记录警告并继续执行，但不会获得自动回滚保护。

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

运行生产构建时仍然需要从命令行指定 provider，例如：

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

exe 同级目录需要准备：

```text
mini-codex.exe
workspace/
.env.openai-compatible
```

如果启用 GitHub MCP，`.env.openai-compatible` 中还需要包含对应的 MCP 配置。

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
[MCP] GitHub connected: <number> tools available.
```

### `edit_file` 拒绝修改

读取目标文件，确认 `oldText` 在文件中只出现一次。出现多次时，应缩小匹配文本或改用更具体的上下文。

## 许可证

项目当前使用 ISC License，具体以 `package.json` 为准。
