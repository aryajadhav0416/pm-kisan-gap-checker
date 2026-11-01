import { NextResponse } from "next/server";
import { loadSources, type SourceMeta } from "@/lib/sources";

export async function GET() {
  try {
    const sources = loadSources();
    const sourcesMeta: SourceMeta[] = sources.map(
      ({ id, title, url, type, date, retrievedOn, file }) => ({
        id,
        title,
        url,
        type,
        date,
        retrievedOn,
        file,
      })
    );

    return NextResponse.json(sourcesMeta);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load sources";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

