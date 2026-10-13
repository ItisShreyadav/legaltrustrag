"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
// Not "@/lib/auth": its index pulls in node:sqlite. constants.ts is client-safe.
import { MIN_PASSWORD_LENGTH, safeNextPath } from "@/lib/auth/constants";

type Mode = "login" | "signup";

const COPY = {
  login: {
    endpoint: "/api/auth/login",
    submit: "Sign in",
    submitting: "Signing in…",
    switchLead: "No account?",
    switchLink: "Create one",
    switchHref: "/signup",
  },
  signup: {
    endpoint: "/api/auth/signup",
    submit: "Create account",
    submitting: "Creating account…",
    switchLead: "Already registered?",
    switchLink: "Sign in",
    switchHref: "/login",
  },
} as const;

const INPUT_CLASS =
  "mt-1.5 block w-full rounded-none border border-rule-strong bg-transparent px-3 py-2 font-serif text-[1.0625rem] leading-normal text-ink focus:border-ink disabled:text-muted";
const LABEL_CLASS = "smallcaps block text-[0.9375rem] leading-tight font-semibold text-muted";

async function errorFromResponse(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  } catch {
    // not JSON
  }
  return `The server responded with ${res.status}. Please try again.`;
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export function AuthForm({ mode }: { mode: Mode }) {
  const copy = COPY[mode];
  const router = useRouter();
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const passwordHintId = useId();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const form = new FormData(event.currentTarget);
    const name = field(form, "name").trim();
    const email = field(form, "email").trim();
    const password = field(form, "password");

    let problem: string | null = null;
    if (mode === "signup" && !name) problem = "Enter your name.";
    else if (!email) problem = "Enter your email address.";
    else if (!password) problem = "Enter your password.";
    else if (mode === "signup" && password.length < MIN_PASSWORD_LENGTH)
      problem = `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`;
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(copy.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { name, email, password } : { email, password }),
      });
      if (!res.ok) {
        setError(await errorFromResponse(res));
        setSubmitting(false);
        return;
      }
      // Stay disabled until the navigation replaces this page.
      router.push(safeNextPath(new URLSearchParams(window.location.search).get("next")));
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={submitting}>
      <fieldset disabled={submitting} className="min-w-0 space-y-5">
        <legend className="sr-only">{mode === "signup" ? "Create an account" : "Sign in"}</legend>
        {mode === "signup" ? (
          <div>
            <label htmlFor={nameId} className={LABEL_CLASS}>
              Name
            </label>
            <input
              id={nameId}
              name="name"
              type="text"
              autoComplete="name"
              required
              maxLength={100}
              className={INPUT_CLASS}
            />
          </div>
        ) : null}
        <div>
          <label htmlFor={emailId} className={LABEL_CLASS}>
            Email
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={254}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor={passwordId} className={LABEL_CLASS}>
            Password
          </label>
          <input
            id={passwordId}
            name="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
            maxLength={256}
            aria-describedby={mode === "signup" ? passwordHintId : undefined}
            className={INPUT_CLASS}
          />
          {mode === "signup" ? (
            <p id={passwordHintId} className="mt-1.5 font-mono text-[0.6875rem] text-muted">
              At least {MIN_PASSWORD_LENGTH} characters
            </p>
          ) : null}
        </div>
      </fieldset>

      <div role="alert">
        {error ? <p className="mt-5 text-[1.0625rem] leading-[1.5] text-accent">{error}</p> : null}
      </div>

      <div className="mt-7 flex flex-wrap items-baseline gap-x-6 gap-y-3">
        <button type="submit" disabled={submitting} className={`btn-primary ${submitting ? "cursor-wait" : ""}`}>
          {submitting ? copy.submitting : copy.submit}
        </button>
        <p className="text-[0.9375rem] leading-[1.5] text-muted">
          {copy.switchLead}{" "}
          <Link href={copy.switchHref} className="link text-ink">
            {copy.switchLink}
          </Link>
          .
        </p>
      </div>
    </form>
  );
}
