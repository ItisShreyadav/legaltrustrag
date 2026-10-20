import { CircleAlert, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { SignOutButton } from "@/components/settings/sign-out-button";
import { ThemeSelector } from "@/components/settings/theme-selector";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth";
import { SESSION_TTL_MS } from "@/lib/auth/constants";
import { getEnv, hasAnthropicCredentials } from "@/lib/env";
import type { SessionUser } from "@/lib/types";

export const metadata: Metadata = { title: "Settings" };

const SESSION_DAYS = Math.round(SESSION_TTL_MS / (24 * 60 * 60 * 1000));

function ProfileCard({ user }: { user: SessionUser }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Profile</h2>
        </CardTitle>
        <CardDescription>The name and email address you registered with.</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="settings-name">Name</FieldLabel>
            <Input id="settings-name" value={user.name} disabled readOnly />
          </Field>
          <Field>
            <FieldLabel htmlFor="settings-email">Email</FieldLabel>
            <Input id="settings-email" type="email" value={user.email} disabled readOnly />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function AppearanceCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 id="settings-theme">Appearance</h2>
        </CardTitle>
        <CardDescription>
          Choose a light or dark interface, or follow your operating system. Saved in this browser.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ThemeSelector aria-labelledby="settings-theme" />
      </CardContent>
    </Card>
  );
}

function SessionCard({ email }: { email: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Session</h2>
        </CardTitle>
        <CardDescription>
          Signed in as <span className="font-medium text-foreground">{email}</span>. Sessions last {SESSION_DAYS} days.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignOutButton />
      </CardContent>
    </Card>
  );
}

function EnvironmentCard({ model, hasApiKey }: { model: string; hasApiKey: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Environment</h2>
        </CardTitle>
        <CardDescription>
          Read from the server. Set <code className="font-mono text-xs">ANTHROPIC_MODEL</code> and{" "}
          <code className="font-mono text-xs">ANTHROPIC_API_KEY</code>, then restart the server to change them.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="divide-y text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
            <dt className="text-muted-foreground">Model</dt>
            <dd className="min-w-0 font-mono text-xs break-all">{model}</dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
            <dt className="text-muted-foreground">Anthropic API key</dt>
            <dd>
              {hasApiKey ? (
                <Badge variant="secondary">
                  <CircleCheck data-icon="inline-start" aria-hidden />
                  Configured
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <CircleAlert data-icon="inline-start" aria-hidden />
                  Not configured
                </Badge>
              )}
            </dd>
          </div>
        </dl>
        {hasApiKey ? null : (
          <p className="mt-3 text-xs text-muted-foreground">Analyses cannot run until an API key is set.</p>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-4 lg:grid-cols-2">
      <span className="sr-only">Loading settings…</span>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-48 rounded-xl" />
      ))}
    </div>
  );
}

/** Validates the session, then reads the server environment at request time. */
async function SettingsContent() {
  const user = await requireUser("/settings");
  await connection();
  // Same source as /api/analyze and /api/health: blank values count as unset, and ANTHROPIC_AUTH_TOKEN also counts as a key.
  const env = getEnv();
  const model = env.ANTHROPIC_MODEL;
  const hasApiKey = hasAnthropicCredentials(env);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <ProfileCard user={user} />
      <AppearanceCard />
      <SessionCard email={user.email} />
      <EnvironmentCard model={model} hasApiKey={hasApiKey} />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Your account, appearance and the server configuration in use." />
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}
