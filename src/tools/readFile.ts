import fs from "fs/promises";
import path from "path";

/**
 * 读取文件
 */
export async function readFile(
  filePath: string
): Promise<string> {
  const absolutePath = path.resolve(filePath);

  const stat = await fs.stat(absolutePath);

  if (!stat.isFile()) {
    throw new Error(`${filePath} 不是一个文件`);
  }

  return await fs.readFile(absolutePath, "utf8");
}