import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Banned phrases per PROJECT_CONTEXT.md Rule 1 and UI requirements
const BANNED_PATTERNS = [
  { phrase: "not eligible", regex: /\bnot\s+eligible\b/i },
  { phrase: "is eligible", regex: /\bis\s+eligible\b/i },
];

function getFilesRecursively(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getFilesRecursively(fullPath, fileList);
    } else if (
      (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx") &&
      !fullPath.includes("/lib/excerpts.ts") // contains keyword list for extraction matching source text
    ) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

describe("UI Text Audit — no prohibited eligibility phrases", () => {
  it("scans app and lib folders to ensure 'not eligible' and 'is eligible' are absent from UI/logic prose", () => {
    const appDir = path.join(process.cwd(), "app");
    const libDir = path.join(process.cwd(), "lib");

    const filesToScan = [
      ...getFilesRecursively(appDir),
      ...getFilesRecursively(libDir),
    ];

    const violations: { file: string; line: number; match: string }[] = [];

    for (const filePath of filesToScan) {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, idx) => {
        // Skip comment lines explaining the rule itself (e.g. prompt rules)
        if (line.includes("NEVER use") || line.includes("without using the word")) {
          return;
        }
        for (const { regex } of BANNED_PATTERNS) {
          if (regex.test(line)) {
            violations.push({
              file: path.relative(process.cwd(), filePath),
              line: idx + 1,
              match: line.trim(),
            });
          }
        }
      });
    }

    expect(
      violations,
      `Found prohibited eligibility phrase(s) in source code:\n${violations
        .map((v) => `  ${v.file}:${v.line} -> "${v.match}"`)
        .join("\n")}`
    ).toEqual([]);
  });
});

