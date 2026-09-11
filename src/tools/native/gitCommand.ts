import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitResult {
  success: boolean;
  command: string;
  stdout: string;
  stderr: string;
  error?: string;
}

export async function runGit(
  args: string[],
  cwd: string,
): Promise<GitResult> {
  const command = ["git", ...args]
    .map((part) => /\s/.test(part) ? JSON.stringify(part) : part)
    .join(" ");

  try {
    const { stdout, stderr } =
      await execFileAsync("git", args, {
        cwd,
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
      });

    return {
      success: true,
      command,
      stdout,
      stderr,
    };
  } catch (error: unknown) {
    const gitError = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    return {
      success: false,
      command,
      stdout: gitError.stdout ?? "",
      stderr: gitError.stderr ?? "",
      error: gitError.message ?? String(error),
    };
  }
}
