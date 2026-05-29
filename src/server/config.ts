import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  dbPath: string;
  secret: Buffer;
}

const rootDir = process.cwd();

function ensureSecret(dataDir: string) {
  const secretPath = path.join(dataDir, "secret.key");
  if (process.env.CCR_CONSOLE_SECRET) {
    return Buffer.from(process.env.CCR_CONSOLE_SECRET).subarray(0, 32);
  }
  if (!existsSync(secretPath)) {
    writeFileSync(secretPath, randomBytes(32));
  }
  return readFileSync(secretPath).subarray(0, 32);
}

export function loadConfig(): AppConfig {
  const dataDir = process.env.DATA_DIR ?? path.join(rootDir, ".ccr-console");
  mkdirSync(dataDir, { recursive: true });

  return {
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 3100),
    dataDir,
    dbPath: process.env.DB_PATH ?? path.join(dataDir, "ccr-console.db"),
    secret: ensureSecret(dataDir)
  };
}
