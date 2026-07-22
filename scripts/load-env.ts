import fs from "node:fs/promises";
import path from "node:path";

async function loadEnvFile(fileName: string, override: boolean): Promise<void> {
  const envPath = path.join(process.cwd(), fileName);
  try {
    const raw = await fs.readFile(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!override && process.env[key]) continue;
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      val = val.replace(/\\n/g, "\n");
      process.env[key] = val;
    }
  } catch {
    // optional
  }
}

/** Load .env then .env.local (local overrides). */
export async function loadEnvFiles(): Promise<void> {
  await loadEnvFile(".env", false);
  await loadEnvFile(".env.local", true);
}
