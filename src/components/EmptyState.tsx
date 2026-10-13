import Link from "next/link";

export function EmptyState() {
  return (
    <p className="max-w-[68ch] text-[1.125rem] leading-[1.7]">
      Once an analysis has run, this section sets out every pair of clauses that contradict one another or carve out an
      exception, marks each of your rules as met, violated or not addressed, and withholds anything that cannot be traced
      to an exact quote in the source.{" "}
      <span className="text-muted">
        Add documents above and choose Analyse, use Load sample for a ready-made pair with deliberate conflicts, or{" "}
        <Link href="/?mock=1" className="link text-ink">
          preview a sample report
        </Link>{" "}
        without an API key.
      </span>
    </p>
  );
}
