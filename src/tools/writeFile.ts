import fs from "fs/promises";
import path from "path";

/**
 * 写入文件
 */
export async function writeFile(
  filePath: string,
  content: string
) {

  // 自动创建父目录
  await fs.mkdir(path.dirname(filePath), {
    recursive: true,
  });

  await fs.writeFile(
    filePath,
    content,
    "utf8"
  );

  return {
    success: true,
    path: filePath,
  };
}