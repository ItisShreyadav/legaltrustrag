"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** "Runs" and "Review" in the site header, with the open review count in mono. Signed-in users only. */
export function HeaderNav({ queued }: { queued: number }) {
  const pathname = usePathname();
  const links = [
    { href: "/runs", label: "Runs", current: pathname === "/runs" || pathname.startsWith("/runs/") },
    { href: "/review", label: "Review", current: pathname === "/review" },
  ];
  return (
    <nav aria-label="Main" className="flex items-baseline gap-x-5">
      {links.map((link) => (
        <span key={link.href} className="flex items-baseline">
          <Link
            href={link.href}
            aria-current={link.current ? "page" : undefined}
            className={`text-[0.9375rem] leading-none ${link.current ? "font-semibold" : "link"}`}
          >
            {link.label}
          </Link>
          {link.href === "/review" && queued > 0 ? (
            <span className="figures ml-[0.75ch] font-mono text-[0.6875rem] leading-none text-muted">
              <span className="sr-only">, </span>
              {queued}
              <span className="sr-only"> queued</span>
            </span>
          ) : null}
        </span>
      ))}
    </nav>
  );
}
