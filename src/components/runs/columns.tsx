import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  metaHelper,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_basic,
  tableFeatures,
} from "@tanstack/react-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { RunSummary } from "@/lib/runs/types";
import { cn } from "@/lib/utils";
import { DataTableColumnHeader } from "./data-table-column-header";
import { documentList, formatUtc } from "./format";
import { ReviewCountBadges } from "./review-badges";
import { RunRowActions } from "./run-row-actions";

/** Per-column display hints read by the table and the column-visibility menu. */
export interface RunColumnMeta {
  /** Plain-text name for menus (headers may be components). */
  label: string;
  align?: "start" | "end";
}

/*
 * Client-side processing over the (at most MAX_LISTED_RUNS) rows the server
 * sends: filter, then sort, then paginate. Module scope keeps it stable.
 */
export const runsTableFeatures = tableFeatures({
  columnFilteringFeature,
  filterFns: { includesString: filterFn_includesString },
  filteredRowModel: createFilteredRowModel(),
  rowSortingFeature,
  sortFns: { basic: sortFn_basic },
  sortedRowModel: createSortedRowModel(),
  columnVisibilityFeature,
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  columnMeta: metaHelper<RunColumnMeta>(),
});

export type RunsTableFeatures = typeof runsTableFeatures;

const helper = createColumnHelper<RunsTableFeatures, RunSummary>();

function Count({ value }: { value: number }) {
  return <div className={cn("text-right tabular-nums", value === 0 && "text-muted-foreground")}>{value}</div>;
}

function DocumentsCell({ run }: { run: RunSummary }) {
  const names = documentList(run.documentNames);
  const count = run.documentNames.length;
  return (
    <div className="flex max-w-[16rem] min-w-0 items-center gap-2 sm:max-w-[24rem]">
      <Link
        href={`/runs/${run.id}`}
        title={names}
        className="min-w-0 truncate rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {names}
      </Link>
      {count > 2 ? (
        <Badge variant="secondary" className="tabular-nums">
          {count} docs
        </Badge>
      ) : null}
    </div>
  );
}

export const runColumns = helper.columns([
  helper.accessor("createdAt", {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    cell: ({ row }) => (
      <time dateTime={row.original.createdAt} className="font-mono text-xs text-muted-foreground tabular-nums">
        {formatUtc(row.original.createdAt)}
      </time>
    ),
    // ISO timestamps order correctly as strings.
    sortFn: "basic",
    sortDescFirst: true,
    enableColumnFilter: false,
    meta: { label: "Date" },
  }),
  helper.accessor((run) => documentList(run.documentNames), {
    id: "documents",
    header: "Documents",
    cell: ({ row }) => <DocumentsCell run={row.original} />,
    filterFn: "includesString",
    enableSorting: false,
    enableHiding: false,
    meta: { label: "Documents" },
  }),
  helper.accessor("ruleCount", {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Rules" align="end" />,
    cell: ({ row }) => <Count value={row.original.ruleCount} />,
    sortFn: "basic",
    sortDescFirst: true,
    enableColumnFilter: false,
    meta: { label: "Rules", align: "end" },
  }),
  helper.accessor("findingCount", {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Findings" align="end" />,
    cell: ({ row }) => <Count value={row.original.findingCount} />,
    sortFn: "basic",
    sortDescFirst: true,
    enableColumnFilter: false,
    meta: { label: "Findings", align: "end" },
  }),
  helper.accessor("withheldCount", {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Withheld" align="end" />,
    cell: ({ row }) => <Count value={row.original.withheldCount} />,
    sortFn: "basic",
    sortDescFirst: true,
    enableColumnFilter: false,
    meta: { label: "Withheld", align: "end" },
  }),
  helper.display({
    id: "review",
    header: "Review",
    cell: ({ row }) => <ReviewCountBadges counts={row.original.reviews} className="flex-nowrap" />,
    meta: { label: "Review" },
  }),
  helper.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <RunRowActions run={row.original} />
      </div>
    ),
    enableHiding: false,
    meta: { label: "Actions", align: "end" },
  }),
]);

/** Stable row ids, so selection-free re-renders after router.refresh() keep row identity. */
export function getRunRowId(run: RunSummary): string {
  return run.id;
}
