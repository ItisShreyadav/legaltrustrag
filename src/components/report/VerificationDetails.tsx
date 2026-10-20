import { CheckIcon, ChevronDownIcon, MinusIcon, XIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { VerificationCheck, VerificationResult } from "@/lib/types";
import { cn } from "@/lib/utils";

const CHECK_ORDER: VerificationCheck["name"][] = ["relevance", "quote", "support", "conflict"];

const CHECK_INFO: Record<VerificationCheck["name"], { title: string; what: string }> = {
  relevance: { title: "Relevance gate", what: "The clauses address the same subject." },
  quote: { title: "Exact quote", what: "Quoted text equals the source at the cited offsets." },
  support: { title: "Support", what: "The quotes support the stated explanation." },
  conflict: { title: "Conflict re-check", what: "An independent pass reaches the same label." },
};

type CheckState = "pass" | "fail" | "missing";

const ICON: Record<CheckState, typeof CheckIcon> = { pass: CheckIcon, fail: XIcon, missing: MinusIcon };
const WORD: Record<CheckState, string> = { pass: "Passed", fail: "Failed", missing: "Not run" };
const TONE: Record<CheckState, string> = {
  pass: "text-foreground",
  fail: "text-destructive",
  missing: "text-muted-foreground",
};

/** A row of check chips that expands to the verifier's notes for each check. */
export function VerificationDetails({ verification }: { verification: VerificationResult }) {
  const byName = new Map(verification.checks.map((c) => [c.name, c]));
  const rows = CHECK_ORDER.map((name) => {
    const check = byName.get(name);
    const state: CheckState = check === undefined ? "missing" : check.passed ? "pass" : "fail";
    return { name, check, state };
  });
  const retries = verification.retries;

  return (
    <Collapsible className="rounded-lg border">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group/verify flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-3 py-2 text-left text-xs transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=open]:rounded-b-none"
        >
          <span className="font-medium text-muted-foreground">Verification</span>
          <span className="sr-only">checks: </span>
          {rows.map(({ name, state }) => {
            const Icon = ICON[state];
            return (
              <span key={name} className={cn("inline-flex items-center gap-1 font-mono", TONE[state])}>
                <Icon className="size-3.5" />
                {name}
                <span className="sr-only"> {WORD[state].toLowerCase()},</span>
              </span>
            );
          })}
          {retries > 0 ? (
            <span className="font-mono text-muted-foreground tabular-nums">
              {retries} {retries === 1 ? "retry" : "retries"}
            </span>
          ) : null}
          <span className="sr-only">Show details</span>
          <ChevronDownIcon className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=open]/verify:rotate-180" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t">
        <Table>
          <caption className="sr-only">Verification checks and the verifier&apos;s notes</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-8 px-2 text-xs sm:px-3">Check</TableHead>
              <TableHead className="h-8 px-2 text-xs sm:px-3">Result</TableHead>
              <TableHead className="h-8 px-2 text-xs sm:px-3">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ name, check, state }) => {
              const Icon = ICON[state];
              const info = CHECK_INFO[name];
              return (
                <TableRow key={name} className="hover:bg-transparent">
                  <TableCell className="px-2 align-top font-mono text-xs sm:px-3">{name}</TableCell>
                  <TableCell className={cn("px-2 align-top text-xs sm:px-3", TONE[state])}>
                    <span className="inline-flex items-center gap-1">
                      <Icon className="size-3.5" />
                      <span className="max-sm:sr-only">{WORD[state]}</span>
                    </span>
                  </TableCell>
                  <TableCell className="min-w-32 px-2 align-top text-xs whitespace-normal sm:min-w-48 sm:px-3">
                    <span className="font-medium">{info.title}.</span>{" "}
                    <span className="text-muted-foreground">{check?.detail ?? info.what}</span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CollapsibleContent>
    </Collapsible>
  );
}
