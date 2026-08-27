import fs from "fs/promises";
import path from "path";

interface SearchResult {
  path: string;
  line: number;
  content: string;
}

const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
]);

const TEXT_EXTENSIONS = new Set([
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".vue",
  ".json",
  ".html",
  ".css",
  ".scss",
  ".less",
  ".md",
  ".txt",
]);

/**
 * 搜索项目文件内容
 */
export async function searchFiles(
  keyword: string,
  searchPath: string = "."
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  const rootPath = path.resolve(searchPath);

  async function walk(
    currentPath: string
  ) {
    const entries = await fs.readdir(
      currentPath,
      {
        withFileTypes: true,
      }
    );

    for (const entry of entries) {
      const fullPath = path.join(
        currentPath,
        entry.name
      );

      // 忽略目录
      if (
        entry.isDirectory() &&
        IGNORE_DIRS.has(entry.name)
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      const ext = path.extname(entry.name);

      if (!TEXT_EXTENSIONS.has(ext)) {
        continue;
      }

      try {
        const content = await fs.readFile(
          fullPath,
          "utf8"
        );

        const lines = content.split(/\r?\n/);

        lines.forEach((line, index) => {
          if (line.includes(keyword)) {
            results.push({
              path: path.relative(
                rootPath,
                fullPath
              ),
              line: index + 1,
              content: line.trim(),
            });
          }
        });
      } catch {
        // 无法读取的文件直接跳过
      }
    }
  }

  await walk(rootPath);

  return results;
}