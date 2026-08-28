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
  const filePath = dirPath;

  const entries = await fs.readdir(filePath, {
    withFileTypes: true,
  });

  return entries.map((entry) => ({
    name: entry.name,
    path: path.join(filePath, entry.name),
    type: entry.isDirectory() ? "directory" : "file",
  }));
}