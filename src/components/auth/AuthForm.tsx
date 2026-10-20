"use client";

import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
// Not "@/lib/auth": its index pulls in node:sqlite. constants.ts is client-safe.
import { MIN_PASSWORD_LENGTH, safeNextPath } from "@/lib/auth/constants";

type Mode = "login" | "signup";
type FieldName = "name" | "email" | "password";
type FieldErrors = Partial<Record<FieldName, string>>;

const COPY = {
  login: {
    endpoint: "/api/auth/login",
    submit: "Sign in",
    submitting: "Signing in…",
    switchLead: "Don’t have an account?",
    switchLink: "Create one",
    switchHref: "/signup",
  },
  signup: {
    endpoint: "/api/auth/signup",
    submit: "Create account",
    submitting: "Creating account…",
    switchLead: "Already have an account?",
    switchLink: "Sign in",
    switchHref: "/login",
  },
} as const;

const FIELD_ORDER: readonly FieldName[] = ["name", "email", "password"];

// A light shape check only; the server validates the address properly.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function errorFromResponse(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  } catch {
    // not JSON
  }
  return `The server responded with ${res.status}. Please try again.`;
}

function readField(form: FormData, name: FieldName): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function validate(mode: Mode, name: string, email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === "signup" && !name) errors.name = "Enter your name.";
  if (!email) errors.email = "Enter your email address.";
  else if (!EMAIL_SHAPE.test(email)) errors.email = "Enter a valid email address, like name@company.com.";
  if (!password) errors.password = "Enter your password.";
  else if (mode === "signup" && password.length < MIN_PASSWORD_LENGTH)
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  return errors;
}

export function AuthForm({ mode }: { mode: Mode }) {
  const copy = COPY[mode];
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const ids = {
    name: useId(),
    email: useId(),
    password: useId(),
    passwordHint: useId(),
  };
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function clearFieldError(name: FieldName) {
    if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const form = new FormData(event.currentTarget);
    const name = readField(form, "name").trim();
    const email = readField(form, "email").trim();
    const password = readField(form, "password");

    const errors = validate(mode, name, email, password);
    const firstInvalid = FIELD_ORDER.find((key) => errors[key]);
    setFieldErrors(errors);
    if (firstInvalid) {
      setFormError(null);
      formRef.current?.querySelector<HTMLInputElement>(`[name="${firstInvalid}"]`)?.focus();
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch(copy.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { name, email, password } : { email, password }),
      });
      if (!res.ok) {
        setFormError(await errorFromResponse(res));
        setSubmitting(false);
        return;
      }
      // Stay disabled until the navigation replaces this page.
      router.push(safeNextPath(new URLSearchParams(window.location.search).get("next")));
      router.refresh();
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  const passwordDescribedBy =
    [
      mode === "signup" && !fieldErrors.password ? ids.passwordHint : null,
      fieldErrors.password ? `${ids.password}-error` : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate aria-busy={submitting}>
      <FieldGroup>
        {mode === "signup" ? (
          <Field data-invalid={fieldErrors.name ? true : undefined}>
            <FieldLabel htmlFor={ids.name}>Name</FieldLabel>
            <Input
              id={ids.name}
              name="name"
              type="text"
              autoComplete="name"
              required
              maxLength={100}
              disabled={submitting}
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={fieldErrors.name ? `${ids.name}-error` : undefined}
              onChange={() => clearFieldError("name")}
            />
            <FieldError id={`${ids.name}-error`}>{fieldErrors.name}</FieldError>
          </Field>
        ) : null}

        <Field data-invalid={fieldErrors.email ? true : undefined}>
          <FieldLabel htmlFor={ids.email}>Email</FieldLabel>
          <Input
            id={ids.email}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={254}
            placeholder="name@company.com"
            disabled={submitting}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? `${ids.email}-error` : undefined}
            onChange={() => clearFieldError("email")}
          />
          <FieldError id={`${ids.email}-error`}>{fieldErrors.email}</FieldError>
        </Field>

        <Field data-invalid={fieldErrors.password ? true : undefined}>
          <FieldLabel htmlFor={ids.password}>Password</FieldLabel>
          <Input
            id={ids.password}
            name="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
            maxLength={256}
            disabled={submitting}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={passwordDescribedBy}
            onChange={() => clearFieldError("password")}
          />
          {mode === "signup" && !fieldErrors.password ? (
            <FieldDescription id={ids.passwordHint}>At least {MIN_PASSWORD_LENGTH} characters.</FieldDescription>
          ) : null}
          <FieldError id={`${ids.password}-error`}>{fieldErrors.password}</FieldError>
        </Field>

        {formError ? (
          <Alert variant="destructive">
            <CircleAlert aria-hidden />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}

        <Field>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? <Spinner aria-hidden data-icon="inline-start" /> : null}
            {submitting ? copy.submitting : copy.submit}
          </Button>
          <FieldDescription className="text-center">
            {copy.switchLead}{" "}
            <Link href={copy.switchHref} className="font-medium text-foreground">
              {copy.switchLink}
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  );
}
