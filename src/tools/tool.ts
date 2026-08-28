import { listFiles } from "./listFiles.js";
import { readFile } from "./readFile.js";
import { writeFile } from "./writeFile.js";
import { editFile } from "./editFile.js";
import { deleteFile } from "./deleteFile.js";
import { searchFiles } from "./searchFiles.js";
import { runCommand } from "./runCommand.js";

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