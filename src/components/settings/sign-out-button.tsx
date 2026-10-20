"use client";

import { LogOut } from "lucide-react";
import { useSignOut } from "@/components/layout/use-sign-out";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function SignOutButton() {
  const { signOut, pending } = useSignOut();

  return (
    <Button variant="outline" onClick={() => void signOut()} disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" aria-hidden /> : <LogOut data-icon="inline-start" aria-hidden />}
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
