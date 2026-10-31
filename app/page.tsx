export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="max-w-xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          PM-KISAN Gap Checker
        </h1>
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          Information-checking tool. Findings are potential gaps and signals,
          not facts. Confirm on the{" "}
          <a
            href="https://pmkisan.gov.in"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            official portal
          </a>
          .
        </p>
      </div>
    </main>
  );
}
