import { spawnSync } from "node:child_process";
import { platform } from "node:os";

/**
 * Copy text to the system clipboard using the first available tool.
 * Returns true on success. Never throws; missing tools / spawn failures
 * are treated as unavailable.
 *
 * Tools (aligned with webywz/vibe-commit, webywz/diff-vibe, webywz/llm-roast):
 * darwin → pbcopy
 * win32 → clip
 * else → wl-copy, then xclip, then xsel
 */
export function copyToClipboard(text: string): boolean {
  const os = platform();
  if (os === "darwin") return pipeTo("pbcopy", []);
  if (os === "win32") return pipeTo("clip", []);
  return (
    pipeTo("wl-copy", []) ||
    pipeTo("xclip", ["-selection", "clipboard"]) ||
    pipeTo("xsel", ["--clipboard", "--input"])
  );

  function pipeTo(command: string, args: string[]): boolean {
    try {
      const result = spawnSync(command, args, {
        input: text,
        encoding: "utf8",
        stdio: ["pipe", "ignore", "ignore"],
      });
      return result.status === 0;
    } catch {
      return false;
    }
  }
}
