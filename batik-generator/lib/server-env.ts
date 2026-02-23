import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let cache: Record<string, string> | null = null;

function parseDotEnv(dotEnvPath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!existsSync(dotEnvPath)) {
    return result;
  }
  const raw = readFileSync(dotEnvPath, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    result[key] = value;
  }
  return result;
}

export function getServerEnv(key: string, fallback = ""): string {
  const runtime = process.env[key];
  if (runtime && runtime.length > 0) {
    return runtime;
  }

  if (!cache) {
    const parentEnvPath = path.join(process.cwd(), "..", ".env");
    cache = parseDotEnv(parentEnvPath);
  }

  return cache[key] ?? fallback;
}
