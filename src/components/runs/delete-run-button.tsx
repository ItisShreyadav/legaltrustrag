"use client";

import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DeleteRunDialog, type DeleteRunTarget } from "./delete-run-dialog";

/** "Delete" in the run page header: confirms, deletes, then returns to the runs list. */
export function DeleteRunButton({ run }: { run: DeleteRunTarget }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Trash2Icon aria-hidden="true" data-icon="inline-start" />
        Delete
      </Button>
      <DeleteRunDialog run={run} open={open} onOpenChange={setOpen} onDeleted={() => router.replace("/runs")} />
    </>
  );
}
