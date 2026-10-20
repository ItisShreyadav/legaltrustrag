"use client";

import { useId } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { MAX_RULES } from "./files";

interface RulesCardProps {
  value: string;
  /** Rules as the server will parse them (deduplicated, list markers stripped). */
  ruleCount: number;
  /** Why the rules cannot be submitted, if anything. */
  error: string | null;
  disabled: boolean;
  onChange: (value: string) => void;
}

/** Optional compliance rules, one per line. */
export function RulesCard({ value, ruleCount, error, disabled, onChange }: RulesCardProps) {
  const titleId = useId();
  const fieldId = useId();
  const hintId = useId();
  const errorId = useId();

  return (
    <Card aria-labelledby={titleId} role="region">
      <CardHeader>
        <CardTitle>
          <h2 id={titleId}>Compliance rules</h2>
        </CardTitle>
        <CardDescription>
          Optional. Each rule is checked against the documents and marked met, violated or not addressed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Field data-invalid={error ? true : undefined}>
          <div className="flex items-center justify-between gap-3">
            <FieldLabel htmlFor={fieldId}>Rules</FieldLabel>
            <span className="text-xs text-muted-foreground tabular-nums">
              {ruleCount} / {MAX_RULES}
              <span className="sr-only"> rules</span>
            </span>
          </div>
          <Textarea
            id={fieldId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            rows={6}
            spellCheck
            placeholder="One rule per line"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            className="max-h-96 min-h-36"
          />
          <FieldDescription id={hintId}>
            Write each rule as a requirement on its own line. Bullets, numbering and duplicate lines are ignored.
          </FieldDescription>
          {error ? <FieldError id={errorId}>{error}</FieldError> : null}
        </Field>
      </CardContent>
    </Card>
  );
}
