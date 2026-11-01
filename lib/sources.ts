import fs from "fs";
import path from "path";

const PLACEHOLDER = "PASTE SOURCE TEXT HERE";
const MIN_CHARS = 500;

export interface SourceMeta {
  id: string;
  title: string;
  url: string;
  type: "official" | "unofficial";
  date: string | null;
  retrievedOn: string;
  file: string;
}

export interface Source extends SourceMeta {
  text: string;
}

/**
 * Reads data/sources.json and each linked .txt file.
 * Skips any source whose file is missing, still contains the placeholder,
 * or is shorter than 500 characters — logging a warning instead of throwing.
 * Throws only if fewer than 2 valid sources remain after filtering.
 *
 * Rule 6: never invent source content — the caller must supply real text.
 */
export function loadSources(): Source[] {
  const dataDir = path.join(process.cwd(), "data");
  const sourcesJsonPath = path.join(dataDir, "sources.json");

  const raw = fs.readFileSync(sourcesJsonPath, "utf-8");
  const metas: SourceMeta[] = JSON.parse(raw);

  const sources: Source[] = [];

  for (const meta of metas) {
    const txtPath = path.join(dataDir, "sources", meta.file);

    let text: string;
    try {
      text = fs.readFileSync(txtPath, "utf-8").trim();
    } catch {
      console.warn(
        `[loadSources] Skipping source "${meta.id}": cannot read file ${txtPath}`
      );
      continue;
    }

    if (text === PLACEHOLDER || text.startsWith(PLACEHOLDER)) {
      console.warn(
        `[loadSources] Skipping source "${meta.id}": file still contains the placeholder text.`
      );
      continue;
    }

    if (text.length < MIN_CHARS) {
      console.warn(
        `[loadSources] Skipping source "${meta.id}": only ${text.length} characters (minimum ${MIN_CHARS}).`
      );
      continue;
    }

    sources.push({ ...meta, text });
  }

  if (sources.length < 2) {
    throw new Error(
      `[loadSources] Fewer than 2 valid sources available (got ${sources.length}). ` +
        `Ensure at least 2 source text files in data/sources/ contain real content (≥${MIN_CHARS} chars).`
    );
  }

  return sources;
}
