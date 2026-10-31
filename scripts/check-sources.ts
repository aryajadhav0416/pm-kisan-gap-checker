/**
 * scripts/check-sources.ts
 * Run with: npm run check:sources
 *
 * Prints a summary table of every source in data/sources.json,
 * including its readiness status, character count, and first 80 chars.
 * Does NOT throw on placeholder/short text — it reports it instead.
 */

import fs from "fs";
import path from "path";
import type { SourceMeta } from "../lib/sources";

const PLACEHOLDER = "PASTE SOURCE TEXT HERE";
const MIN_CHARS = 500;

const dataDir = path.join(process.cwd(), "data");
const sourcesJsonPath = path.join(dataDir, "sources.json");

const metas: SourceMeta[] = JSON.parse(fs.readFileSync(sourcesJsonPath, "utf-8"));

const COL = {
  id: 22,
  type: 11,
  date: 12,
  chars: 8,
  status: 12,
  preview: 80,
};

function pad(s: string, n: number) {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

const header =
  pad("ID", COL.id) +
  pad("TYPE", COL.type) +
  pad("DATE", COL.date) +
  pad("CHARS", COL.chars) +
  pad("STATUS", COL.status) +
  "FIRST 80 CHARS";

console.log(header);
console.log("-".repeat(header.length));

for (const meta of metas) {
  const txtPath = path.join(dataDir, "sources", meta.file);

  let text = "";
  let status = "OK";

  try {
    text = fs.readFileSync(txtPath, "utf-8").trim();
  } catch {
    status = "FILE MISSING";
  }

  if (status === "OK") {
    if (text === PLACEHOLDER || text.startsWith(PLACEHOLDER)) {
      status = "PLACEHOLDER";
    } else if (text.length < MIN_CHARS) {
      status = "TOO SHORT";
    }
  }

  const chars = text.length;
  const preview = text.slice(0, COL.preview).replace(/\n/g, " ");

  const row =
    pad(meta.id, COL.id) +
    pad(meta.type, COL.type) +
    pad(meta.date ?? "null", COL.date) +
    pad(String(chars), COL.chars) +
    pad(status, COL.status) +
    preview;

  console.log(row);
}
