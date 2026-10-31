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
 * Throws a descriptive error if a text file still contains the placeholder
 * or has fewer than 500 characters.
 *
 * Rule 6: never invent source content — the caller must supply real text.
 */
export function loadSources(): Source[] {
  const dataDir = path.join(process.cwd(), "data");
  const sourcesJsonPath = path.join(dataDir, "sources.json");

  const raw = fs.readFileSync(sourcesJsonPath, "utf-8");
  const metas: SourceMeta[] = JSON.parse(raw);

  return metas.map((meta) => {
    const txtPath = path.join(dataDir, "sources", meta.file);

    let text: string;
    try {
      text = fs.readFileSync(txtPath, "utf-8").trim();
    } catch {
      throw new Error(
        `[loadSources] Cannot read file for source "${meta.id}": ${txtPath}`
      );
    }

    if (text === PLACEHOLDER || text.startsWith(PLACEHOLDER)) {
      throw new Error(
        `[loadSources] Source "${meta.id}" still contains the placeholder text. ` +
          `Paste the real source content into data/sources/${meta.file} before running.`
      );
    }

    if (text.length < MIN_CHARS) {
      throw new Error(
        `[loadSources] Source "${meta.id}" has only ${text.length} characters (minimum ${MIN_CHARS}). ` +
          `Paste the full source content into data/sources/${meta.file}.`
      );
    }

    return { ...meta, text };
  });
}
