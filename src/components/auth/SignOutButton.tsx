"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setPending(false);
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={signOut} disabled={pending} className="link text-[0.8125rem] leading-none">
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
