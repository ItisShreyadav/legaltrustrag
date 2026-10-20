"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

/** POST /api/auth/logout, then back to /login. Shows a toast and stays put if the request fails. */
export function useSignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error(`Logout failed with ${res.status}`);
    } catch {
      setPending(false);
      toast.error("Could not sign out", { description: "Check your connection and try again." });
      return;
    }
    // Stay pending until the navigation replaces this page.
    router.push("/login");
    router.refresh();
  }

  return { signOut, pending };
}
