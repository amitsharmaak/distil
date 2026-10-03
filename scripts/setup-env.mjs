#!/usr/bin/env node
// Fill values into .env.local without touching anything else in the file.
// Used by scripts/setup.sh. Each environment variable named SET_<KEY> replaces
// the `<KEY>=` line (or appends one). Values are written verbatim: no shell
// quoting, no sed escaping, so password hashes with `\$` survive untouched.
//
//   SET_GEMINI_API_KEY=... node scripts/setup-env.mjs [path]

import { readFileSync, writeFileSync } from "node:fs";

const path = process.argv[2] ?? ".env.local";
const updates = Object.entries(process.env)
  .filter(([name, value]) => name.startsWith("SET_") && value !== undefined)
  .map(([name, value]) => [name.slice(4), value]);

if (updates.length === 0) {
  process.stderr.write("setup-env: nothing to set (no SET_<KEY> variables)\n");
  process.exit(2);
}

const original = readFileSync(path, "utf8");
const lines = original.split("\n");
for (const [key, value] of updates) {
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  const line = `${key}=${value}`;
  if (index === -1) lines.push(line);
  else lines[index] = line;
}
let output = lines.join("\n");
if (!output.endsWith("\n")) output += "\n";
writeFileSync(path, output);
