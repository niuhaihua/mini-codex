import fs from "fs/promises";

/**
 * 读取文件
 */
export async function readFile(
  filePath: string
): Promise<string> {

  const stat = await fs.stat(filePath);

  if (!stat.isFile()) {
    throw new Error(`${filePath} 不是一个文件`);
  }

  return await fs.readFile(filePath, "utf8");
}