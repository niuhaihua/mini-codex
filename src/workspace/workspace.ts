import fs from "node:fs/promises";
import path from "node:path";

export class Workspace {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /**
   * 获取工作区根目录
   */
  getRoot(): string {
    return this.root;
  }

  /**
   * 将相对路径转换成工作区绝对路径
   */
  resolve(relativePath: string): string {
    const absolutePath = path.resolve(
      this.root,
      relativePath,
    );

    this.ensureInsideWorkspace(
      absolutePath,
    );

    return absolutePath;
  }

  /**
   * 检查路径是否位于 Workspace 内
   */
  private ensureInsideWorkspace(
    absolutePath: string,
  ): void {
    const relative = path.relative(
      this.root,
      absolutePath,
    );

    if (
      relative.startsWith("..") ||
      path.isAbsolute(relative)
    ) {
      throw new Error(
        `Path is outside workspace: ${absolutePath}`,
      );
    }
  }

  /**
   * 判断文件是否存在
   */
  async exists(
    relativePath: string,
  ): Promise<boolean> {
    try {
      const filePath =
        this.resolve(relativePath);

      await fs.access(filePath);

      return true;
    } catch {
      return false;
    }
  }

  /**
   * 读取文件
   */
  async readFile(
    relativePath: string,
  ): Promise<string> {
    const filePath =
      this.resolve(relativePath);

    return fs.readFile(
      filePath,
      "utf-8",
    );
  }

  /**
   * 写入文件
   */
  async writeFile(
    relativePath: string,
    content: string,
  ): Promise<void> {
    const filePath =
      this.resolve(relativePath);

    await fs.mkdir(
      path.dirname(filePath),
      {
        recursive: true,
      },
    );

    await fs.writeFile(
      filePath,
      content,
      "utf-8",
    );
  }

  /**
   * 删除文件
   */
  async deleteFile(
    relativePath: string,
  ): Promise<void> {
    const filePath =
      this.resolve(relativePath);

    await fs.unlink(filePath);
  }

  /**
   * 获取目录内容
   */
  async listFiles(
    relativePath = ".",
  ): Promise<string[]> {
    const directory =
      this.resolve(relativePath);

    const entries =
      await fs.readdir(
        directory,
        {
          withFileTypes: true,
        },
      );

    return entries.map(
      (entry) => {
        const entryPath =
          path.join(
            relativePath,
            entry.name,
          );

        return entry.isDirectory()
          ? `${entryPath}/`
          : entryPath;
      },
    );
  }

  /**
   * 判断是否为目录
   */
  async isDirectory(
    relativePath: string,
  ): Promise<boolean> {
    const filePath =
      this.resolve(relativePath);

    const stat =
      await fs.stat(filePath);

    return stat.isDirectory();
  }
}