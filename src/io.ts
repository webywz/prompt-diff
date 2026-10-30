import { readFile } from "node:fs/promises";
import { stdin as stdinStream } from "node:process";
import type { SuitePairInput } from "./types.js";

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdinStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readSource(path: string): Promise<string> {
  if (path === "-") return readStdin();
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new UsageError(`file not found: ${path}`);
    if (code === "EISDIR") throw new UsageError(`expected a file, got a directory: ${path}`);
    throw err;
  }
}

export function resolvePromptPaths(
  positionals: string[],
  flags: { old?: string; new?: string },
): { old: string; new: string } {
  const rest = [...positionals];
  const oldPath = flags.old ?? rest.shift();
  const newPath = flags.new ?? rest.shift();
  if (rest.length > 0) {
    throw new UsageError(`unexpected extra arguments: ${rest.join(" ")}`);
  }
  if (!oldPath || !newPath) {
    throw new UsageError("need two prompts (old and new). See --help.");
  }
  if (oldPath === "-" && newPath === "-") {
    throw new UsageError("only one side can be read from stdin (-)");
  }
  return { old: oldPath, new: newPath };
}

export async function readSuiteFile(path: string): Promise<SuitePairInput[]> {
  const content = await readSource(path);
  
  let parsed: unknown;
  if (path.endsWith(".json")) {
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      throw new UsageError(`invalid JSON in suite file ${path}: ${err instanceof Error ? err.message : err}`);
    }
  } else if (path.endsWith(".yml") || path.endsWith(".yaml")) {
    // Simple YAML parser for arrays of objects
    try {
      parsed = parseSimpleYaml(content);
    } catch (err) {
      throw new UsageError(`invalid YAML in suite file ${path}: ${err instanceof Error ? err.message : err}`);
    }
  } else {
    throw new UsageError(`suite file must be .json, .yml, or .yaml (got ${path})`);
  }

  if (!Array.isArray(parsed)) {
    throw new UsageError(`suite file must contain an array of {id?, old, new} objects`);
  }

  const pairs: SuitePairInput[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (typeof item !== "object" || item === null) {
      throw new UsageError(`suite item ${i} must be an object with {id?, old, new}`);
    }
    const { id, old, new: newPath } = item as Record<string, unknown>;
    if (typeof old !== "string" || typeof newPath !== "string") {
      throw new UsageError(`suite item ${i} must have string "old" and "new" fields`);
    }
    if (id !== undefined && typeof id !== "string") {
      throw new UsageError(`suite item ${i} "id" must be a string if present`);
    }
    pairs.push({ id: id as string | undefined, old, new: newPath });
  }

  if (pairs.length === 0) {
    throw new UsageError("suite file must contain at least one pair");
  }

  return pairs;
}

function parseSimpleYaml(content: string): unknown {
  // Simple YAML array parser for our use case
  const lines = content.split(/\r?\n/);
  const items: Array<Record<string, string>> = [];
  let currentItem: Record<string, string> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    
    if (trimmed === "-" || trimmed.startsWith("- ")) {
      if (currentItem) items.push(currentItem);
      currentItem = {};
      
      // Handle inline: - key: value
      const match = trimmed.match(/^-\s+(\w+):\s*(.+)$/);
      if (match && match[1] && match[2]) {
        const key = match[1];
        const value = match[2];
        currentItem[key] = value.replace(/^["']|["']$/g, "");
      }
    } else if (currentItem) {
      const match = trimmed.match(/^(\w+):\s*(.+)$/);
      if (match && match[1] && match[2]) {
        const key = match[1];
        const value = match[2];
        currentItem[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  }
  
  if (currentItem) items.push(currentItem);
  return items;
}
