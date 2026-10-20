"use client";

import { useTable } from "@tanstack/react-table";
import { SearchIcon, XIcon } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RunSummary } from "@/lib/runs/types";
import { cn } from "@/lib/utils";
import { getRunRowId, runColumns, runsTableFeatures } from "./columns";
import { ariaSort } from "./data-table-column-header";
import { DataTablePagination } from "./data-table-pagination";
import { DataTableViewOptions } from "./data-table-view-options";
import { plural } from "./format";

interface Props {
  /** The user's most recent runs, newest first, as listed by the server. */
  runs: RunSummary[];
  /** All of the user's runs; more than runs.length when the list was capped. */
  total: number;
}

/**
 * Saved runs as a data table: filter by document name, sort by date or counts,
 * hide columns, paginate. Everything runs client-side over the rows the server
 * sent, which are capped (MAX_LISTED_RUNS); the row count says so when they are.
 */
export function RunsTable({ runs, total }: Props) {
  const filterInput = useRef<HTMLInputElement>(null);
  const table = useTable({
    features: runsTableFeatures,
    columns: runColumns,
    data: runs,
    getRowId: getRunRowId,
    enableSortingRemoval: false,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      pagination: { pageIndex: 0, pageSize: 10 },
    },
  });

  const documents = table.getColumn("documents");
  const filter = typeof documents?.getFilterValue() === "string" ? (documents.getFilterValue() as string) : "";
  const matched = table.getFilteredRowModel().rows.length;
  const rows = table.getRowModel().rows;
  const visibleColumns = table.getVisibleLeafColumns().length;
  const capped = total > runs.length;
  const { pageIndex, pageSize } = table.state.pagination;

  // Reset to the first page in the same update as the filter, so the table
  // never renders an out-of-range (empty) page in between.
  function setFilter(value: string) {
    documents?.setFilterValue(value);
    table.setPageIndex(0);
  }

  /** Clearing removes the button that was clicked, so focus goes back to the input. */
  function clearFilter() {
    setFilter("");
    filterInput.current?.focus();
  }

  const countText = filter
    ? `${matched} of ${plural(runs.length, "run")}`
    : capped
      ? `${runs.length} most recent of ${total} runs`
      : plural(runs.length, "run");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:max-w-xs">
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            ref={filterInput}
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by document name"
            aria-label="Filter runs by document name"
            autoComplete="off"
            spellCheck={false}
            className="[&::-webkit-search-cancel-button]:appearance-none"
          />
          {filter ? (
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" aria-label="Clear filter" onClick={clearFilter}>
                <XIcon aria-hidden="true" />
              </InputGroupButton>
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
          {countText}
        </p>
        <DataTableViewOptions
          columns={table.getAllLeafColumns().map((column) => ({
            id: column.id,
            label: column.columnDef.meta?.label ?? column.id,
            getCanHide: () => column.getCanHide(),
            getIsVisible: () => column.getIsVisible(),
            toggleVisibility: (value?: boolean) => column.toggleVisibility(value),
          }))}
        />
      </div>

      <Card className="gap-0 py-0">
        <Table className="min-w-[46rem]">
          <TableCaption className="sr-only">Saved runs. Column headers with a button sort the table.</TableCaption>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const meta = header.column.columnDef.meta;
                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      scope="col"
                      aria-sort={ariaSort(header.column)}
                      className={cn("px-3 text-muted-foreground", meta?.align === "end" && "text-right")}
                    >
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {matched > 0 ? (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn("px-3", cell.column.columnDef.meta?.align === "end" && "text-right")}
                    >
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={visibleColumns} className="h-28 text-center whitespace-normal text-muted-foreground">
                  No runs match &ldquo;{filter}&rdquo;.{" "}
                  <Button variant="link" size="sm" className="px-1" onClick={clearFilter}>
                    Clear filter
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {matched > 0 ? (
        <DataTablePagination
          pageIndex={pageIndex}
          pageCount={table.getPageCount()}
          pageSize={pageSize}
          onPageChange={(index) => table.setPageIndex(index)}
          onPageSizeChange={(size) => table.setPageSize(size)}
        />
      ) : null}
    </div>
  );
}
