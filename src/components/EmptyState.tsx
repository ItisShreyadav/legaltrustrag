import Link from "next/link";

const POINTS = [
  {
    title: "Conflicts with exact quotes",
    body: "Contradictions and carve-outs between clauses, each backed by quotes checked character-for-character against the source.",
  },
  {
    title: "Compliance matrix",
    body: "Every rule you supply is marked met, violated or not addressed, with the evidence that decided it.",
  },
  {
    title: "Abstains when unsure",
    body: "Findings that fail relevance, quote, support or conflict checks are withheld instead of reported.",
  },
];

export function EmptyState() {
  return (
    <section
      aria-labelledby="empty-heading"
      className="flex h-full flex-col justify-center rounded-xl border border-dashed border-zinc-300 bg-white/60 px-6 py-10 dark:border-zinc-700 dark:bg-zinc-900/40"
    >
      <h2 id="empty-heading" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        No report yet
      </h2>
      <p className="mt-1 max-w-prose text-sm text-zinc-600 dark:text-zinc-400">
        Add one or more contracts (for example an MSA and its amendment), optionally list the rules they must satisfy, then
        run the analysis. Use <span className="font-medium text-zinc-800 dark:text-zinc-200">Load sample</span> for a
        ready-made pair with deliberate conflicts.
      </p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-3">
        {POINTS.map((p) => (
          <li key={p.title} className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{p.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{p.body}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
        No API key yet?{" "}
        <Link
          href="/?mock=1"
          className="font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-indigo-400"
        >
          Preview a sample report
        </Link>
        .
      </p>
    </section>
  );
}
