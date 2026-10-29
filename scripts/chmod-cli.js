import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const shebang = "#!/usr/bin/env node\n";
const cli = process.argv[2]
  ? pathToFileURL(resolve(process.argv[2]))
  : new URL("../dist/cli.js", import.meta.url);

let source = readFileSync(cli, "utf8");
if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);
if (!source.startsWith(shebang)) {
  source = shebang + source.replace(/^#!.*\r?\n/, "");
}
writeFileSync(cli, source);
chmodSync(cli, 0o755);
