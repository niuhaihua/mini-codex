import { runGit } from "./gitCommand.js";

/** Commit already staged changes with the supplied message. */
export function gitCommit(
  cwd: string,
  message: string,
) {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return Promise.resolve({
      success: false,
      command: "git commit",
      stdout: "",
      stderr: "",
      error: "Commit message must not be empty.",
    });
  }

  return runGit(
    ["commit", "-m", trimmedMessage],
    cwd,
  );
}
