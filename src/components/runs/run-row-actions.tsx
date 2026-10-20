"use client";

import { ArrowUpRightIcon, CopyIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { RunSummary } from "@/lib/runs/types";
import { DeleteRunDialog } from "./delete-run-dialog";
import { documentTitle, reviewTotal } from "./format";

/** Row menu on /runs: open, copy the run id, delete (with confirmation). */
export function RunRowActions({ run }: { run: RunSummary }) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const label = documentTitle(run.documentNames);

  async function copyId() {
    try {
      await navigator.clipboard.writeText(run.id);
      toast.success("Run id copied", { description: run.id });
    } catch {
      toast.error("Could not copy the run id", { description: run.id });
    }
  }

  return (
    <>
      {/* Non-modal, so the delete dialog can take focus cleanly when the menu closes. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${label}`}>
            <MoreHorizontalIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem asChild>
            <Link href={`/runs/${run.id}`}>
              <ArrowUpRightIcon aria-hidden="true" />
              Open
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={copyId}>
            <CopyIcon aria-hidden="true" />
            Copy run id
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
            <Trash2Icon aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteRunDialog
        run={{ id: run.id, label, reviewCount: reviewTotal(run.reviews) }}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => router.refresh()}
      />
    </>
  );
}
