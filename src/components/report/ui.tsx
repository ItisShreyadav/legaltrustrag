import type { ComplianceRow, NliLabel, VerificationResult } from "@/lib/types";

/*
 * Typographic primitives shared by the input form and the report. No badges,
 * no icons: status is carried by plain words, italics and the single accent.
 */

/** Section heading in the style of a brief: mono number hanging in the gutter, serif title. */
export function NumberedHeading({
  id,
  number,
  title,
  level = 2,
  aside,
}: {
  id: string;
  number: string;
  title: string;
  level?: 2 | 3;
  aside?: React.ReactNode;
}) {
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <Tag
        id={id}
        className={`flex items-baseline md:-ml-16 ${
          level === 2 ? "text-[1.625rem] leading-tight font-semibold" : "text-[1.25rem] leading-snug font-semibold"
        }`}
      >
        <span className="mr-3 shrink-0 font-mono text-[0.8125rem] font-normal text-muted md:mr-0 md:w-16">{number}</span>
        <span>{title}</span>
      </Tag>
      {aside}
    </div>
  );
}

const LABELS: Record<NliLabel, { text: string; className: string }> = {
  contradict: { text: "Contradict", className: "text-accent" },
  exception: { text: "Exception", className: "italic" },
  agree: { text: "Agree", className: "" },
  not_mentioned: { text: "Not mentioned", className: "italic" },
};

export function LabelText({ label }: { label: NliLabel }) {
  const { text, className } = LABELS[label];
  return <span className={className}>{text}</span>;
}

const STATUSES: Record<VerificationResult["status"], { text: string; className: string }> = {
  verified: { text: "verified", className: "" },
  unverified: { text: "unverified", className: "italic" },
  withheld: { text: "withheld", className: "italic" },
};

export function StatusText({ status }: { status: VerificationResult["status"] }) {
  const { text, className } = STATUSES[status];
  return <span className={className}>{text}</span>;
}

const COMPLIANCE: Record<ComplianceRow["status"], { text: string; className: string }> = {
  met: { text: "Met", className: "" },
  violated: { text: "Violated", className: "font-semibold text-accent" },
  not_addressed: { text: "Not addressed", className: "italic text-muted" },
};

export function ComplianceText({ status }: { status: ComplianceRow["status"] }) {
  const { text, className } = COMPLIANCE[status];
  return <span className={className}>{text}</span>;
}

/** Confidence as a two-decimal figure, e.g. 0.87. */
export function formatConfidence(value: number): string {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return clamped.toFixed(2);
}

export function Confidence({ value }: { value: number }) {
  return (
    <span>
      <span className="sr-only">confidence </span>
      {formatConfidence(value)}
    </span>
  );
}

/** Middle-dot separator for mono reference lines. */
export function Sep() {
  return (
    <span aria-hidden="true" className="px-[0.6ch] text-muted">
      ·
    </span>
  );
}
