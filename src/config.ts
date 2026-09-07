// 获取不同.env文件的配置
import dotenv from "dotenv";

const provider = process.argv[2] ?? "openai";

const envFile = `.env.${provider}`;

const result = dotenv.config({
  path: envFile,
});

if (result.error) {
  throw new Error(
    `无法加载环境配置文件: ${envFile}`
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `缺少环境变量: ${name}`
    );
  }

  return value;
}

export const config = {
  provider: requireEnv("MODEL_PROVIDER"),
  apiKey: requireEnv("MODEL_API_KEY"),
  baseURL: requireEnv("MODEL_BASE_URL"),
  model: requireEnv("MODEL_NAME"),
};