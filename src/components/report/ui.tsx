import type { ComplianceRow, NliLabel, VerificationResult } from "@/lib/types";

type Tone = "red" | "amber" | "green" | "zinc" | "blue";

const TONES: Record<Tone, string> = {
  red: "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/30",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/25 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/30",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30",
  zinc: "bg-zinc-100 text-zinc-700 ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-600/40",
  blue: "bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/30",
};

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const LABELS: Record<NliLabel, { text: string; tone: Tone }> = {
  contradict: { text: "Contradict", tone: "red" },
  exception: { text: "Exception", tone: "amber" },
  agree: { text: "Agree", tone: "green" },
  not_mentioned: { text: "Not mentioned", tone: "zinc" },
};

export function LabelBadge({ label }: { label: NliLabel }) {
  const { text, tone } = LABELS[label];
  return <Badge tone={tone}>{text}</Badge>;
}

const STATUSES: Record<VerificationResult["status"], { text: string; tone: Tone }> = {
  verified: { text: "Verified", tone: "green" },
  unverified: { text: "Unverified", tone: "amber" },
  withheld: { text: "Withheld", tone: "zinc" },
};

export function StatusBadge({ status }: { status: VerificationResult["status"] }) {
  const { text, tone } = STATUSES[status];
  return (
    <Badge tone={tone}>
      {status === "verified" ? <CheckIcon className="size-3" /> : null}
      {text}
    </Badge>
  );
}

const COMPLIANCE: Record<ComplianceRow["status"], { text: string; tone: Tone }> = {
  met: { text: "Met", tone: "green" },
  violated: { text: "Violated", tone: "red" },
  not_addressed: { text: "Not addressed", tone: "zinc" },
};

export function ComplianceBadge({ status }: { status: ComplianceRow["status"] }) {
  const { text, tone } = COMPLIANCE[status];
  return <Badge tone={tone}>{text}</Badge>;
}

export function ConfidenceMeter({ value, className = "" }: { value: number; className?: string }) {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  const pct = Math.round(clamped * 100);
  const bar = clamped >= 0.75 ? "bg-emerald-500" : clamped >= 0.5 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        role="meter"
        aria-label="Confidence"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}% confidence`}
        className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
      >
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium tabular-nums text-zinc-600 dark:text-zinc-400">{pct}%</span>
    </div>
  );
}

export function CheckIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function CrossIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M5.3 5.3a1 1 0 0 1 1.4 0L10 8.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 10l3.3 3.3a1 1 0 0 1-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 10 5.3 6.7a1 1 0 0 1 0-1.4Z" />
    </svg>
  );
}

export function SectionHeading({
  id,
  title,
  count,
  description,
}: {
  id: string;
  title: string;
  count?: number;
  description?: string;
}) {
  return (
    <div className="mb-3">
      <h2 id={id} className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
        {count !== undefined ? (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {count}
          </span>
        ) : null}
      </h2>
      {description ? <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{description}</p> : null}
    </div>
  );
}
