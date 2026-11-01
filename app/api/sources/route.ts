import { NextResponse } from "next/server";
import { loadSources, type SourceMeta } from "@/lib/sources";

// Note: no `dynamic` or `revalidate` export here — nextConfig.cacheComponents
// is incompatible with route segment cache config. API routes that perform
// filesystem I/O are not statically prerendered by Next.js automatically.

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

