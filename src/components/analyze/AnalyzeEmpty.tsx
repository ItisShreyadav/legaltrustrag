import { EyeOffIcon, FileSearchIcon, GitCompareArrowsIcon, ListChecksIcon } from "lucide-react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

const SECTIONS = [
  {
    icon: GitCompareArrowsIcon,
    title: "Findings",
    text: "Clause pairs that contradict each other or carve out an exception, each quoted from the source.",
  },
  {
    icon: ListChecksIcon,
    title: "Compliance",
    text: "Every rule you supplied, marked met, violated or not addressed, with its evidence.",
  },
  {
    icon: EyeOffIcon,
    title: "Withheld",
    text: "Candidates that failed verification, listed so the abstention can be checked.",
  },
] as const;

/** Shown below the form before the first run: what the report will contain. */
export function AnalyzeEmpty() {
  return (
    <Empty className="border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileSearchIcon />
        </EmptyMedia>
        <EmptyTitle>No report yet</EmptyTitle>
        <EmptyDescription>
          Add documents and run an analysis. Every result is tied to an exact quote from the source; anything that cannot
          be verified is withheld rather than reported.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-3xl">
        <ul className="grid w-full gap-3 text-left sm:grid-cols-3">
          {SECTIONS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex flex-col gap-1.5 rounded-lg border bg-background p-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Icon className="size-4 text-muted-foreground" />
                {title}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">{text}</span>
            </li>
          ))}
        </ul>
      </EmptyContent>
    </Empty>
  );
}
