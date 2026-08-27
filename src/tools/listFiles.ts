import fs from "fs/promises";
import path from "path";

export interface FileInfo {
  name: string;
  path: string;
  type: "file" | "directory";
}

/**
 * 列出目录中的文件
 */
export async function listFiles(
  dirPath: string = "."
): Promise<FileInfo[]> {
  const absolutePath = path.resolve(dirPath);

  const entries = await fs.readdir(absolutePath, {
    withFileTypes: true,
  });

  return entries.map((entry) => ({
    name: entry.name,
    path: path.join(absolutePath, entry.name),
    type: entry.isDirectory() ? "directory" : "file",
  }));
}