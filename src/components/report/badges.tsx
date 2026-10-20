import { CheckIcon, CircleDashedIcon, EyeOffIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import type { ComplianceRow, NliLabel, VerificationResult } from "@/lib/types";
import { cn } from "@/lib/utils";

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

const LABELS: Record<NliLabel, { text: string; variant: BadgeVariant }> = {
  contradict: { text: "Contradiction", variant: "destructive" },
  exception: { text: "Exception", variant: "secondary" },
  agree: { text: "Agreement", variant: "outline" },
  not_mentioned: { text: "Not mentioned", variant: "outline" },
};

/** The NLI label of a finding. `muted` drops the tone, for withheld candidates that are not findings. */
export function LabelBadge({ label, muted, className }: { label: NliLabel; muted?: boolean; className?: string }) {
  const { text, variant } = LABELS[label];
  return (
    <Badge variant={muted ? "outline" : variant} className={cn(muted && "text-muted-foreground", className)}>
      {text}
    </Badge>
  );
}

const VERIFICATION: Record<VerificationResult["status"], { text: string; variant: BadgeVariant; icon: typeof CheckIcon }> = {
  verified: { text: "Verified", variant: "default", icon: CheckIcon },
  unverified: { text: "Unverified", variant: "outline", icon: CircleDashedIcon },
  withheld: { text: "Withheld", variant: "secondary", icon: EyeOffIcon },
};

export function VerificationBadge({ status, className }: { status: VerificationResult["status"]; className?: string }) {
  const { text, variant, icon: Icon } = VERIFICATION[status];
  return (
    <Badge variant={variant} className={className}>
      <Icon data-icon="inline-start" />
      {text}
    </Badge>
  );
}

const COMPLIANCE: Record<ComplianceRow["status"], { text: string; variant: BadgeVariant }> = {
  met: { text: "Met", variant: "default" },
  violated: { text: "Violated", variant: "destructive" },
  not_addressed: { text: "Not addressed", variant: "outline" },
};

export function ComplianceBadge({ status, className }: { status: ComplianceRow["status"]; className?: string }) {
  const { text, variant } = COMPLIANCE[status];
  return (
    <Badge variant={variant} className={className}>
      {text}
    </Badge>
  );
}

/** Confidence as a two-decimal figure, e.g. 0.87. */
export function formatConfidence(value: number): string {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return clamped.toFixed(2);
}

/** "Confidence 0.87", the figure in mono. */
export function ConfidenceText({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1 text-xs text-muted-foreground", className)}>
      Confidence
      <span className="font-mono text-foreground tabular-nums">{formatConfidence(value)}</span>
    </span>
  );
}
