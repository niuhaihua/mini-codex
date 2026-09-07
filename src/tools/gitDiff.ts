import { runGit } from "./gitCommand.js";

/** Return the working tree diff, or the staged diff when requested. */
export function gitDiff(
  cwd: string,
  staged = false,
) {
  return runGit(
    staged ? ["diff", "--cached"] : ["diff"],
    cwd,
  );
}
