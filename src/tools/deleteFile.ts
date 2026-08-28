import fs from "fs/promises";
import path from "path";

/**
 * 删除文件
 */
export async function deleteFile(
  filePath: string
) : Promise<{
  success: boolean;
  path: string;
  message: string;
}> {
  const stat = await fs.stat(filePath);

  if (!stat.isFile()) {
    throw new Error(
      `${filePath} 不是一个文件`
    );
  }

  await fs.unlink(filePath);

  return {
    success: true,
    path: filePath,
    message: "文件删除成功",
  };
}