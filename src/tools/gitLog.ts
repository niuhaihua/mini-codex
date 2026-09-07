import { runGit } from "./gitCommand.js";

/** Return recent commits in a compact, machine-readable format. */
export function gitLog(
  cwd: string,
  maxCount = 10,
) {
  const count = Number.isInteger(maxCount) && maxCount > 0
    ? Math.min(maxCount, 100)
    : 10;

  return runGit(
    [
      "log",
      `--max-count=${count}`,
      "--date=iso",
      "--pretty=format:%H%n%an%n%ad%n%s%n---",
    ],
    cwd,
  );
}
