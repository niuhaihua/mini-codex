import fs from "fs/promises";
import path from "path";

/**
 * 写入文件
 */
export async function writeFile(
  filePath: string,
  content: string
) {
  const absolutePath = path.resolve(filePath);

  // 自动创建父目录
  await fs.mkdir(path.dirname(absolutePath), {
    recursive: true,
  });

  await fs.writeFile(
    absolutePath,
    content,
    "utf8"
  );

  return {
    success: true,
    path: absolutePath,
  };
}