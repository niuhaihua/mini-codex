import { runGit } from "./gitCommand.js";

/** Return the current branch and working tree status. */
export function gitStatus(cwd: string) {
  return runGit(["status", "--short", "--branch"], cwd);
}
