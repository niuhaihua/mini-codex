// 获取不同.env文件的配置
import dotenv from "dotenv";

const provider =
  process.argv
    .slice(2)
    .find(
      (argument) =>
        argument !== "--" &&
        !argument.startsWith("-"),
    ) ?? "openai";

const envFile = `.env.${provider}`;

const result = dotenv.config({
  path: envFile,
  override: true,
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

const timeoutMs = Number(
  process.env.MODEL_TIMEOUT_MS ?? "600000",
);

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  throw new Error(
    "MODEL_TIMEOUT_MS must be a positive number.",
  );
}

export const config = {
  provider: requireEnv("MODEL_PROVIDER"),
  apiKey: requireEnv("MODEL_API_KEY"),
  baseURL: requireEnv("MODEL_BASE_URL"),
  model: requireEnv("MODEL_NAME"),
  timeoutMs,
};
