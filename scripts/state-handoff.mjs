#!/usr/bin/env node
// Derives the current handoff from the append-only state log in docs/state/log/.
//
//   node scripts/state-handoff.mjs            print the handoff (latest entry per topic)
//   node scripts/state-handoff.mjs --all      include closed and archived topics
//   node scripts/state-handoff.mjs --topic x  print every entry for one topic, oldest first
//   node scripts/state-handoff.mjs --check    validate every entry; exit 1 on any problem
//
// Entry format: docs/state/README.md. Nothing here is committed; the log files are the record.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const logDir = join(root, "docs", "state", "log");

export const STATUSES = [
  "planned",
  "in-progress",
  "blocked",
  "merged",
  "released",
  "closed",
  "ongoing",
  "archived",
];
const OPEN = new Set(["planned", "in-progress", "blocked", "merged", "ongoing"]);
const FILE_RE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const TOPIC_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: null, body: text };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const kv = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!kv) return { meta: null, body: match[2], badLine: line };
    let value = kv[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[kv[1]] = value;
  }
  return { meta, body: match[2] };
}

function sectionText(body, heading) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) return null;
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

export function loadEntries() {
  const problems = [];
  const entries = [];
  let files;
  try {
    files = readdirSync(logDir).filter((f) => f.endsWith(".md"));
  } catch {
    return { entries, problems: [`missing directory ${relative(root, logDir)}`] };
  }
  for (const file of files.sort()) {
    const path = join(logDir, file);
    const rel = relative(root, path);
    const fileMatch = file.match(FILE_RE);
    if (!fileMatch) {
      problems.push(`${rel}: file name must be YYYY-MM-DD-<topic>[-<slug>].md in kebab-case`);
      continue;
    }
    const text = readFileSync(path, "utf8");
    const { meta, body, badLine } = parseFrontmatter(text);
    if (!meta) {
      problems.push(
        `${rel}: missing or malformed frontmatter${badLine ? ` (line: ${badLine})` : ""}`
      );
      continue;
    }
    for (const key of ["topic", "title", "date", "status"]) {
      if (!meta[key]) problems.push(`${rel}: frontmatter needs "${key}"`);
    }
    if (meta.topic && !TOPIC_RE.test(meta.topic)) {
      problems.push(`${rel}: topic "${meta.topic}" must be kebab-case`);
    }
    if (meta.topic && !fileMatch[2].startsWith(meta.topic)) {
      problems.push(`${rel}: file name must start with the date and the topic "${meta.topic}"`);
    }
    if (meta.date && !DATE_RE.test(meta.date)) {
      problems.push(`${rel}: date "${meta.date}" must be YYYY-MM-DD`);
    }
    if (meta.date && meta.date !== fileMatch[1]) {
      problems.push(`${rel}: date ${meta.date} does not match the file name date ${fileMatch[1]}`);
    }
    if (meta.time && !TIME_RE.test(meta.time)) {
      problems.push(`${rel}: time "${meta.time}" must be HH:MM (24-hour, UTC)`);
    }
    if (meta.status && !STATUSES.includes(meta.status)) {
      problems.push(`${rel}: status "${meta.status}" must be one of ${STATUSES.join(", ")}`);
    }
    if (meta.pr && !/^#?\d+(\s*,\s*#?\d+)*$/.test(meta.pr)) {
      problems.push(`${rel}: pr "${meta.pr}" must be a PR number or a comma-separated list`);
    }
    const next = sectionText(body, "Next");
    if (OPEN.has(meta.status) && (next === null || next === "")) {
      problems.push(`${rel}: status "${meta.status}" needs a "## Next" section with content`);
    }
    if (
      /(postgres(ql)?:\/\/[^\s`]*@|\bsk-(ant-)?[A-Za-z0-9_-]{16,}|\bAIza[0-9A-Za-z_-]{20,})/.test(
        text
      )
    ) {
      problems.push(`${rel}: looks like it contains a connection string or API key`);
    }
    entries.push({ file: rel, meta, body, next });
  }
  return { entries, problems };
}

function sortKey(e) {
  return `${e.meta.date} ${e.meta.time ?? "00:00"} ${e.file}`;
}

export function latestPerTopic(entries) {
  const byTopic = new Map();
  for (const e of entries) {
    const list = byTopic.get(e.meta.topic) ?? [];
    list.push(e);
    byTopic.set(e.meta.topic, list);
  }
  const latest = [];
  for (const [topic, list] of byTopic) {
    list.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    latest.push({ topic, entry: list[list.length - 1], history: list });
  }
  latest.sort((a, b) => sortKey(b.entry).localeCompare(sortKey(a.entry)));
  return latest;
}

function indent(text, pad = "    ") {
  return text
    .split("\n")
    .map((l) => (l ? pad + l : l))
    .join("\n");
}

function printEntry({ topic, entry, history }, { withNext = true } = {}) {
  const m = entry.meta;
  const bits = [m.status, m.date + (m.time ? ` ${m.time}Z` : "")];
  if (m.branch) bits.push(`branch ${m.branch}`);
  if (m.pr) bits.push(`PR ${m.pr}`);
  console.log(`- ${m.title}`);
  console.log(`    topic ${topic} · ${bits.join(" · ")}`);
  console.log(`    ${entry.file}${history.length > 1 ? ` (+${history.length - 1} earlier)` : ""}`);
  if (withNext && entry.next) console.log(indent(entry.next));
  console.log("");
}

function main(argv) {
  const { entries, problems } = loadEntries();
  const check = argv.includes("--check");
  if (check) {
    const sameDay = new Map();
    for (const e of entries) {
      const k = `${e.meta.topic} ${e.meta.date}`;
      if (sameDay.has(k) && !(e.meta.time && sameDay.get(k).meta.time)) {
        console.warn(
          `warning: ${e.file} and ${sameDay.get(k).file} share a topic and date; add "time:" to order them`
        );
      }
      sameDay.set(k, e);
    }
    if (problems.length) {
      for (const p of problems) console.error(`error: ${p}`);
      console.error(`\n${problems.length} problem(s) in ${relative(root, logDir)}`);
      process.exit(1);
    }
    console.log(
      `state log ok: ${entries.length} entries, ${latestPerTopic(entries).length} topics`
    );
    return;
  }
  if (problems.length) {
    for (const p of problems) console.error(`error: ${p}`);
  }
  const topicIdx = argv.indexOf("--topic");
  if (topicIdx !== -1) {
    const topic = argv[topicIdx + 1];
    const found = latestPerTopic(entries).find((t) => t.topic === topic);
    if (!found) {
      console.error(`no entries for topic "${topic}"`);
      process.exit(1);
    }
    console.log(
      `# ${topic} — ${found.history.length} entr${found.history.length === 1 ? "y" : "ies"}\n`
    );
    for (const entry of found.history) printEntry({ topic, entry, history: [entry] });
    return;
  }
  const all = argv.includes("--all");
  const latest = latestPerTopic(entries);
  const open = latest.filter((t) => OPEN.has(t.entry.meta.status));
  const rest = latest.filter((t) => !OPEN.has(t.entry.meta.status));
  const generated = new Date().toISOString().slice(0, 16).replace("T", " ");
  console.log(`# Distil handoff — derived from docs/state/log at ${generated}Z\n`);
  console.log(
    `Read AGENTS.md for the rules. Latest entry per topic wins; older entries are history.\n`
  );
  console.log(`## Open (${open.length})\n`);
  for (const t of open) printEntry(t);
  if (all) {
    console.log(`## Closed, released or archived (${rest.length})\n`);
    for (const t of rest) printEntry(t, { withNext: false });
  } else {
    console.log(
      `${rest.length} closed, released or archived topic(s) hidden; run with --all to list them.`
    );
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
