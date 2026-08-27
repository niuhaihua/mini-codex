import {
  exec
} from "child_process";

import {
  promisify
} from "util";

const execAsync = promisify(exec);

/**
 * 执行终端命令
 */
export async function runCommand(
  command: string
) {
  try {
    const {
      stdout,
      stderr
    } = await execAsync(command, {
      cwd: process.cwd(),

      // Windows 使用 cmd
      shell:
        process.platform === "win32"
          ? "cmd.exe"
          : "/bin/bash",

      // 2分钟超时
      timeout: 120000,

      // 最大输出 10MB
      maxBuffer:
        10 * 1024 * 1024,
    });

    return {
      success: true,
      command,
      stdout,
      stderr,
    };
  } catch (error: any) {
    return {
      success: false,
      command,
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      error: error.message,
    };
  }
}