import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppPaths } from "../config.js";
import type { Session } from "./types.js";

const CURRENT_VERSION = 1;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

export async function writeSession(paths: AppPaths, session: Session): Promise<string> {
  await mkdir(paths.sessions, { recursive: true });

  const slug = slugify(session.name) || slugify(session.capturedAt);
  const filePath = await getAvailableSessionFilePath(paths.sessions, slug);

  return await writeSessionFile(filePath, session);
}

export async function writeSessionFile(filePath: string, session: Session): Promise<string> {
  const existing = await stat(filePath).catch(() => null);

  if (existing?.isDirectory()) {
    throw new Error(`Output path is a directory: ${filePath}`);
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(session, null, 2)}\n`, "utf-8");
  return filePath;
}

export async function readSession(filePath: string): Promise<Session> {
  const text = await readFile(filePath, "utf-8");
  const data = JSON.parse(text) as Session;

  if (data.version !== CURRENT_VERSION) {
    throw new Error(`Unsupported session version: ${data.version} (expected ${CURRENT_VERSION})`);
  }

  return data;
}

export async function listSessions(paths: AppPaths): Promise<string[]> {
  try {
    const files = await readdir(paths.sessions);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => path.join(paths.sessions, f))
      .sort();
  } catch {
    return [];
  }
}

async function getAvailableSessionFilePath(directory: string, slug: string): Promise<string> {
  let candidate = path.join(directory, `${slug}.json`);
  let suffix = 2;

  while (await fileExists(candidate)) {
    candidate = path.join(directory, `${slug}-${suffix}.json`);
    suffix += 1;
  }

  return candidate;
}
