import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface RunCommandResult {
  success: boolean;
  command: string;
  stdout: string;
  stderr: string;
  error?: string;
}

export async function runCommand(
  command: string,
  cwd: string = process.cwd()
): Promise<RunCommandResult> {
  try {
    const {
      stdout,
      stderr,
    } = await execAsync(command, {
      cwd,

      shell:
        process.platform === "win32"
          ? "cmd.exe"
          : "/bin/bash",

      timeout: 120000,

      maxBuffer:
        10 * 1024 * 1024,
    });

    return {
      success: true,
      command,
      stdout,
      stderr,
    };
  } catch (error: unknown) {
    const execError =
      error as {
        stdout?: string;
        stderr?: string;
        message?: string;
      };

    return {
      success: false,
      command,
      stdout:
        execError.stdout ?? "",
      stderr:
        execError.stderr ?? "",
      error:
        execError.message ??
        String(error),
    };
  }
}