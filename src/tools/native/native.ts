import type { ToolDefinition } from "../../llm/types.js";
import type { Workspace } from "../../workspace/workspace.js";
import { createToolRegistry, toolDefinitions } from "./tool.js";
import type { NativeToolCategory, NativeToolset } from "../registry.js";

const FILE_TOOLS = new Set([
  "list_files",
  "read_file",
  "write_file",
  "edit_file",
  "delete_file",
  "search_files",
]);

const GIT_TOOLS = new Set([
  "git_status",
  "git_diff",
  "git_log",
  "git_commit",
  "git_checkpoint",
  "git_checkpoint_discard",
  "git_checkpoint_inspect",
  "git_rollback",
]);

const SHELL_TOOLS = new Set(["run_command"]);
const INTERNAL_TOOLS = new Set([
  "git_checkpoint_discard",
  "git_checkpoint_inspect",
]);

function categoryFor(name: string): NativeToolCategory {
  if (FILE_TOOLS.has(name)) return "file";
  if (GIT_TOOLS.has(name)) return "git";
  if (SHELL_TOOLS.has(name)) return "shell";
  throw new Error(`Native tool is not assigned to a category: ${name}`);
}

export function createNativeToolsets(workspace: Workspace): NativeToolset[] {
  const functions = createToolRegistry(workspace);
  const definitionsByCategory = new Map<NativeToolCategory, ToolDefinition[]>();
  const categories: NativeToolCategory[] = ["file", "git", "shell"];

  for (const definition of toolDefinitions) {
    const category = categoryFor(definition.name);
    const definitions = definitionsByCategory.get(category) ?? [];
    definitions.push(definition);
    definitionsByCategory.set(category, definitions);
  }

  return categories.map((category) => ({
    category,
    definitions: definitionsByCategory.get(category) ?? [],
    functions: Object.fromEntries(
      [
        ...toolDefinitions.map((definition) => definition.name),
        ...INTERNAL_TOOLS,
      ]
        .filter((name) => {
          if (INTERNAL_TOOLS.has(name)) return category === "git";
          return categoryFor(name) === category;
        })
        .flatMap((name) => {
          const tool = functions[name];
          return tool ? [[name, tool] as const] : [];
        }),
    ) as NativeToolset["functions"],
  }));
}
