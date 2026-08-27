import fs from "fs/promises";
import path from "path";

/**
 * 删除文件
 */
export async function deleteFile(
  filePath: string
) {
  const absolutePath = path.resolve(filePath);

  const stat = await fs.stat(absolutePath);

  if (!stat.isFile()) {
    throw new Error(
      `${filePath} 不是一个文件`
    );
  }

  await fs.unlink(absolutePath);

  return {
    success: true,
    path: absolutePath,
    message: "文件删除成功",
  };
}