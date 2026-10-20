import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The slice of a TanStack column (with rowSortingFeature) that a sortable header needs. */
export interface SortableColumn {
  getCanSort: () => boolean;
  getIsSorted: () => false | "asc" | "desc";
  getToggleSortingHandler: () => undefined | ((event: unknown) => void);
}

/** Value for the header cell's aria-sort; undefined for columns that cannot be sorted. */
export function ariaSort(column: SortableColumn): "ascending" | "descending" | "none" | undefined {
  if (!column.getCanSort()) return undefined;
  const sorted = column.getIsSorted();
  return sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none";
}

/**
 * Header label as a ghost button that cycles the column's sort. The sort state
 * itself is announced through aria-sort on the enclosing <th>.
 */
export function DataTableColumnHeader({
  column,
  title,
  align = "start",
}: {
  column: SortableColumn;
  title: string;
  align?: "start" | "end";
}) {
  if (!column.getCanSort()) return <span className={cn(align === "end" && "block text-right")}>{title}</span>;
  const sorted = column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUpIcon : sorted === "desc" ? ArrowDownIcon : ChevronsUpDownIcon;
  return (
    <div className={cn("flex", align === "end" && "justify-end")}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={column.getToggleSortingHandler()}
        className={cn("h-7", align === "end" ? "-mr-2.5" : "-ml-2.5")}
      >
        {title}
        <Icon aria-hidden="true" data-icon="inline-end" className={cn(sorted === false && "text-muted-foreground")} />
      </Button>
    </div>
  );
}
