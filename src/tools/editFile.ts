import fs from "fs/promises";
import path from "path";

export interface EditFileOptions {
  path: string;
  oldText: string;
  newText: string;
}

/**
 * 修改文件中的指定内容
 */
export async function editFile(
  options: EditFileOptions
) {
  const absolutePath = path.resolve(options.path);

  let content = await fs.readFile(
    absolutePath,
    "utf8"
  );

  if (!content.includes(options.oldText)) {
    throw new Error(
      `没有在文件中找到要替换的内容:\n${options.oldText}`
    );
  }

  const occurrences =
    content.split(options.oldText).length - 1;

  // 防止误修改多个位置
  if (occurrences > 1) {
    throw new Error(
      `oldText 在文件中出现了 ${occurrences} 次，无法确定应该修改哪一处`
    );
  }

  content = content.replace(
    options.oldText,
    options.newText
  );

  await fs.writeFile(
    absolutePath,
    content,
    "utf8"
  );

  return {
    success: true,
    path: absolutePath,
    message: "文件修改成功",
  };
}