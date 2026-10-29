import { readFile } from "node:fs/promises";
import { stdin as stdinStream } from "node:process";

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
