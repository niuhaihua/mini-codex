import { listFiles } from "./listFiles.js";
import { readFile } from "./readFile.js";
import { writeFile } from "./writeFile.js";
import { editFile } from "./editFile.js";
import { deleteFile } from "./deleteFile.js";
import { searchFiles } from "./searchFiles.js";
import { runCommand } from "./runCommand.js";
import {
  gitStatus,
} from "./gitStatus.js";
import { gitDiff } from "./gitDiff.js";
import { gitLog } from "./gitLog.js";
import { gitCommit } from "./gitCommit.js";
import {
  gitCheckpoint,
  gitCheckpointDiscard,
  gitCheckpointInspect,
} from "./gitCheckpoint.js";
import { gitRollback } from "./gitRollback.js";

import type { ToolDefinition } from "../llm/types.js";
import type {
  ToolArguments,
  ToolExecutor,
} from "../agent/agent.js";
import type { Workspace } from "../workspace/workspace.js";

/**
 * Tool 函数
 */
export type ToolFunction = (
  args: ToolArguments
) => Promise<string>;

/**
 * 创建 Tool Registry
 *
 * Workspace 通过参数注入。
 */
export function createToolRegistry(
  workspace: Workspace
): Record<string, ToolFunction> {
  return {
    /**
     * 列出文件
     */
    list_files: async (args) => {
      const result = await listFiles(
        workspace.resolve(
          String(args.path ?? ".")
        )
      );

      return JSON.stringify(result);
    },

    /**
     * 读取文件
     */
    read_file: async (args) => {
      const filePath = workspace.resolve(
        String(args.path ?? "")
      );

      return await readFile(filePath);
    },

    /**
     * 写入文件
     */
    write_file: async (args) => {
      const filePath = workspace.resolve(
        String(args.path ?? "")
      );

      const result = await writeFile(
        filePath,
        String(args.content ?? "")
      );

      return JSON.stringify(result);
    },

    /**
     * 编辑文件
     */
    edit_file: async (args) => {
      const filePath = workspace.resolve(
        String(args.path ?? "")
      );

      const result = await editFile({
        path: filePath,
        oldText: String(
          args.oldText ?? ""
        ),
        newText: String(
          args.newText ?? ""
        ),
      });

      return JSON.stringify(result);
    },

    /**
     * 删除文件
     */
    delete_file: async (args) => {
      const filePath = workspace.resolve(
        String(args.path ?? "")
      );

      const result = await deleteFile(
        filePath
      );

      return JSON.stringify(result);
    },

    /**
     * 搜索文件
     */
    search_files: async (args) => {
      const searchPath =
        workspace.resolve(
          String(args.path ?? ".")
        );

      const result = await searchFiles(
        String(args.query ?? ""),
        searchPath
      );

      return JSON.stringify(result);
    },

    /**
     * 执行命令
     */
    run_command: async (args) => {
      const result = await runCommand(
        String(args.command ?? ""),
        workspace.getRoot()
      );

      return JSON.stringify(result);
    },

    /** Return the current Git branch and working tree status. */
    git_status: async () => {
      return JSON.stringify(
        await gitStatus(workspace.getRoot())
      );
    },

    /** Return the Git diff for unstaged or staged changes. */
    git_diff: async (args) => {
      const staged = args.staged === true;

      return JSON.stringify(
        await gitDiff(
          workspace.getRoot(),
          staged,
        )
      );
    },

    /** Return recent Git commits. */
    git_log: async (args) => {
      const maxCount = Number(args.maxCount ?? 10);

      return JSON.stringify(
        await gitLog(
          workspace.getRoot(),
          maxCount,
        )
      );
    },

    /** Commit currently staged changes. */
    git_commit: async (args) => {
      return JSON.stringify(
        await gitCommit(
          workspace.getRoot(),
          String(args.message ?? ""),
        )
      );
    },

    /** Create an in-memory checkpoint of the current Git state. */
    git_checkpoint: async () => {
      return JSON.stringify(
        await gitCheckpoint(workspace.getRoot())
      );
    },

    git_checkpoint_discard: async (args) => {
      return JSON.stringify(
        gitCheckpointDiscard(
          String(args.checkpointId ?? ""),
        ),
      );
    },

    git_checkpoint_inspect: async (args) => {
      return JSON.stringify(
        await gitCheckpointInspect(
          workspace.getRoot(),
          String(args.checkpointId ?? ""),
        ),
      );
    },

    /** Restore a previously created Git checkpoint. */
    git_rollback: async (args) => {
      return JSON.stringify(
        await gitRollback(
          workspace.getRoot(),
          String(args.checkpointId ?? ""),
        )
      );
    },
  };
}

/**
 * Tool Definitions
 *
 * 提供给 LLM。
 */
export const toolDefinitions: ToolDefinition[] = [
  {
    type: "function",
    name: "list_files",
    description:
      "列出工作区指定目录下的文件和目录。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "相对于工作区根目录的目录路径。留空表示工作区根目录。",
        },
      },
      required: [],
    },
  },

  {
    type: "function",
    name: "read_file",
    description:
      "读取工作区中的文件内容。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "相对于工作区根目录的文件路径。",
        },
      },
      required: ["path"],
    },
  },

  {
    type: "function",
    name: "write_file",
    description:
      "在工作区中创建或覆盖文件。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "相对于工作区根目录的文件路径。",
        },
        content: {
          type: "string",
          description:
            "要写入的文件内容。",
        },
      },
      required: ["path", "content"],
    },
  },

  {
    type: "function",
    name: "edit_file",
    description:
      "编辑工作区中的文件，将唯一匹配的 oldText 替换为 newText。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "相对于工作区根目录的文件路径。",
        },
        oldText: {
          type: "string",
          description:
            "需要替换的旧文本。",
        },
        newText: {
          type: "string",
          description:
            "替换后的新文本。",
        },
      },
      required: [
        "path",
        "oldText",
        "newText",
      ],
    },
  },

  {
    type: "function",
    name: "delete_file",
    description:
      "删除工作区中的指定文件。",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description:
            "相对于工作区根目录的文件路径。",
        },
      },
      required: ["path"],
    },
  },

  {
    type: "function",
    name: "search_files",
    description:
      "搜索工作区中的文件内容。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "要搜索的关键词。",
        },
        path: {
          type: "string",
          description:
            "相对于工作区根目录的搜索目录。留空表示整个工作区。",
        },
      },
      required: ["query"],
    },
  },

  {
    type: "function",
    name: "run_command",
    description:
      "在工作区根目录中执行 Shell 命令。",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            "要执行的 Shell 命令。",
        },
      },
      required: ["command"],
    },
  },

  {
    type: "function",
    name: "git_status",
    description:
      "当前 Git 分支和工作区状态。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  {
    type: "function",
    name: "git_diff",
    description:
      "显示 Git 变更。将 staged 设置为 true 以显示暂存的变更。",
    parameters: {
      type: "object",
      properties: {
        staged: {
          type: "boolean",
          description:
            "是否显示暂存的变更。默认为 false。",
        },
      },
      required: [],
    },
  },

  {
    type: "function",
    name: "git_log",
    description:
      "显示最近的 Git 提交记录，以紧凑的格式呈现。",
    parameters: {
      type: "object",
      properties: {
        maxCount: {
          type: "integer",
          description:
            "要返回的提交数量最大值 (1-100, 默认 10)。",
        },
      },
      required: [],
    },
  },

  {
    type: "function",
    name: "git_commit",
    description:
      "提交已暂存的更改并提供提交信息。",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description:
            "提交信息。更改必须先暂存。",
        },
      },
      required: ["message"],
    },
  },

  {
    type: "function",
    name: "git_checkpoint",
    description:
      "创建当前 Git 状态的临时检查点。可以使用 git_rollback 恢复该检查点。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },

  {
    type: "function",
    name: "git_rollback",
    description:
      "恢复 Git 检查点。这将丢弃检查点之后进行的更改。",
    parameters: {
      type: "object",
      properties: {
        checkpointId: {
          type: "string",
          description:
            "由 git_checkpoint 返回的 ID。",
        },
      },
      required: ["checkpointId"],
    },
  },
];

/**
 * 创建 Tool Executor
 */
export function createToolExecutor(
  workspace: Workspace
): ToolExecutor {
  const toolFunctions =
    createToolRegistry(workspace);

  return {
    async execute(
      name: string,
      args: ToolArguments
    ): Promise<string> {
      const tool =
        toolFunctions[name];

      if (!tool) {
        throw new Error(
          `未知工具：${name}`
        );
      }

      return await tool(args);
    },
  };
}
