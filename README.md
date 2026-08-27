# Mini Codex

一个基于 **TypeScript + OpenAI API** 实现的极简 Codex 风格 AI Coding Agent。

项目目标是从零搭建一个最小可运行的 AI 编程助手，理解 Coding Agent 的基本工作原理，并逐步扩展文件读取、文件修改、命令执行、工具调用等 Agent 能力。

## ✨ 特性

- 🤖 基于 OpenAI API
- 🟦 TypeScript 开发
- 🟢 Node.js 运行环境
- 🛠️ 支持开发模式实时运行
- 📦 支持 TypeScript 编译构建
- 🔍 支持 TypeScript 类型检查
- 🧹 支持清理构建目录
- 🔄 支持一键重新构建
- 🧩 为后续扩展 Coding Agent Tools 做基础

## 📦 技术栈

| 技术 | 用途 |
|---|---|
| Node.js | JavaScript 运行环境 |
| TypeScript | 项目开发语言 |
| OpenAI SDK | 调用 OpenAI API |
| dotenv | 加载环境变量 |
| tsx | TypeScript 开发环境运行 |
| pnpm | 包管理工具 |

## 📁 项目结构

```text
mini-codex/
├── src/
│   └── index.ts          # 程序入口
│
├── dist/                 # TypeScript 编译后的文件
│
├── .env                  # 环境变量配置
├── package.json
├── tsconfig.json
└── README.md
```

> `dist/` 为编译产物，通常不需要手动修改。

## 🚀 安装

### 1. 安装 Node.js

建议使用较新的 Node.js LTS 版本。

检查 Node.js：

```bash
node -v
```

检查 pnpm：

```bash
pnpm -v
```

项目指定的包管理器版本：

```text
pnpm@10.32.1
```

### 2. 安装依赖

进入项目目录：

```bash
cd mini-codex
```

安装依赖：

```bash
pnpm install
```

## 🔑 配置 OpenAI API

在项目根目录创建：

```text
.env
```

例如：

```env
OPENAI_API_KEY=your_api_key
```

程序通过 `dotenv` 读取环境变量。

> 不要把真实 API Key 提交到 Git 仓库。建议将 `.env` 加入 `.gitignore`。

## ▶️ 运行项目

### 开发模式

```bash
pnpm dev
```

实际执行：

```bash
tsx src/index.ts
```

开发阶段推荐使用这种方式，可以直接运行 TypeScript 源码。

### 构建项目

```bash
pnpm build
```

执行：

```text
tsc
```

TypeScript 会将 `src` 中的代码编译到 `dist`。

### 运行构建后的项目

```bash
pnpm start
```

实际执行：

```bash
node dist/index.js
```

### 类型检查

如果只想检查 TypeScript 类型，而不生成编译文件：

```bash
pnpm typecheck
```

等价于：

```bash
tsc --noEmit
```

### 清理构建目录

```bash
pnpm clean
```

删除：

```text
dist/
```

### 清理并重新构建

```bash
pnpm rebuild
```

相当于：

```bash
pnpm clean
pnpm build
```

## 📜 npm Scripts

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发模式运行 |
| `pnpm build` | 编译 TypeScript |
| `pnpm start` | 运行编译后的程序 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm clean` | 删除 `dist` |
| `pnpm rebuild` | 清理并重新构建 |

## 🧠 Mini Codex 的基本架构

当前项目可以理解为一个最小化的 Coding Agent：

```text
用户
 │
 ▼
┌─────────────────┐
│   Mini Codex    │
│    Agent Loop   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   OpenAI API    │
│      Model      │
└────────┬────────┘
         │
         ▼
    Tool / Action
         │
    ┌────┴────┐
    ▼         ▼
 文件系统    Shell
```

核心思想是：

```text
用户提出任务
    ↓
Agent 理解任务
    ↓
调用模型
    ↓
模型决定是否需要工具
    ↓
执行工具
    ↓
把工具结果返回模型
    ↓
模型继续推理
    ↓
完成任务
```

## 🛠️ 后续可以扩展的 Tools

这个项目的重点并不仅仅是调用 OpenAI API，而是逐渐构建一个真正的 Coding Agent。

可以按照下面的顺序扩展：

### 第一阶段：文件系统

```text
list_files
read_file
write_file
delete_file
```

例如：

```text
用户：帮我看看 src 目录有哪些文件

Agent
 ↓
list_files("src")
 ↓
返回文件列表
```

### 第二阶段：文件编辑

增加：

```text
create_file
edit_file
replace_in_file
```

让 Agent 能够真正修改代码。

### 第三阶段：Shell

增加：

```text
run_command
```

例如：

```text
pnpm install
pnpm build
npm test
git status
```

这样 Agent 就具备执行开发任务的能力。

### 第四阶段：Agent Loop

将程序从：

```text
用户 → 模型 → 返回结果
```

升级为：

```text
用户
 ↓
模型
 ↓
Tool Call
 ↓
执行 Tool
 ↓
Tool Result
 ↓
模型
 ↓
Tool Call
 ↓
...
 ↓
完成任务
```

这一步是 Mini Codex 的核心。

## 🎯 项目目标

最终希望实现一个简化版 Coding Agent：

```text
Mini Codex
│
├── Agent
│   ├── Prompt
│   ├── Agent Loop
│   └── Context
│
├── Model
│   └── OpenAI Responses API
│
├── Tools
│   ├── listFiles
│   ├── readFile
│   ├── writeFile
│   ├── editFile
│   └── runCommand
│
└── Runtime
    ├── Node.js
    └── TypeScript
```

最终使用体验类似：

```text
> 帮我找到项目中所有使用 axios 的文件

Agent:
正在搜索项目...

> 找到了 8 个文件。

> 帮我把 axios 请求统一增加 timeout: 10000

Agent:
我会修改以下文件：
- src/api/user.ts
- src/api/device.ts
- src/api/order.ts

是否继续？

> yes

Agent:
修改完成。

正在执行 pnpm build...

✓ Build successful
```

## 📚 学习路线

如果使用这个项目学习 AI Coding Agent，可以按照：

```text
TypeScript
   ↓
Node.js
   ↓
OpenAI API
   ↓
Tool Calling
   ↓
Function Calling
   ↓
Agent Loop
   ↓
文件系统 Tools
   ↓
Shell Tools
   ↓
Context Management
   ↓
MCP
   ↓
完整 Coding Agent
```

## 🔒 安全注意事项

Coding Agent 一旦拥有文件系统和 Shell 权限，就可能执行具有破坏性的操作。

后续增加工具时建议：

- 限制 Agent 的工作目录
- 禁止访问敏感目录
- Shell 命令执行前进行权限检查
- 对危险命令进行拦截
- 文件修改提供 Diff
- 支持用户确认
- 不允许 `.env` 等敏感文件被模型随意读取
- API Key 不要写入源码

## 📄 License

本项目使用 ISC License。