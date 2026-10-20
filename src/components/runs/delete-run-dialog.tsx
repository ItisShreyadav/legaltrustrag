"use client";

import { Trash2Icon } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { deleteRunRequest, messageOf } from "./api";
import { plural } from "./format";

export interface DeleteRunTarget {
  id: string;
  /** Document names as shown to the user, e.g. documentTitle(run.documentNames). */
  label: string;
  /** Review rows that are deleted with the run. */
  reviewCount: number;
}

interface Props {
  run: DeleteRunTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the run is gone (deleted now, or already deleted elsewhere). */
  onDeleted: () => void;
}

/**
 * Confirmation for permanently deleting a saved run. Controlled, so it can be
 * opened from a dropdown item as well as a button. Stays open (and cannot be
 * dismissed) while the request is in flight; failures are reported as a toast.
 */
export function DeleteRunDialog({ run, open, onOpenChange, onDeleted }: Props) {
  const [pending, setPending] = useState(false);

  async function confirm(event: MouseEvent<HTMLButtonElement>) {
    // Keep the dialog open until the server has answered.
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const outcome = await deleteRunRequest(run.id);
      toast.success(outcome === "deleted" ? "Run deleted" : "Run was already deleted", { description: run.label });
      onOpenChange(false);
      onDeleted();
    } catch (err) {
      toast.error("Could not delete the run", { description: messageOf(err) });
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive dark:bg-destructive/20">
            <Trash2Icon aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete this run?</AlertDialogTitle>
          <AlertDialogDescription>
            The report for <span className="font-medium break-all text-foreground">{run.label}</span>, its stored
            document text
            {run.reviewCount > 0 ? ` and ${plural(run.reviewCount, "review decision")}` : ""} will be permanently
            deleted. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} aria-busy={pending} onClick={confirm}>
            {pending ? <Spinner aria-hidden="true" /> : <Trash2Icon aria-hidden="true" data-icon="inline-start" />}
            {pending ? "Deleting…" : "Delete run"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
