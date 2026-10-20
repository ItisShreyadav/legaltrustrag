import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalyzeWorkspace } from "@/components/analyze/AnalyzeWorkspace";
import { AnalyzeWorkspaceSkeleton } from "@/components/analyze/AnalyzeWorkspaceSkeleton";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "New analysis",
};

/** Validates the session (the proxy only checks that the cookie exists); redirects to /login otherwise. */
async function SignedInWorkspace() {
  await requireUser("/analyze");
  return <AnalyzeWorkspace />;
}

export default function AnalyzePage() {
  return (
    <>
      <PageHeader
        title="New analysis"
        description="Upload contracts, add compliance rules if you have them, and run a verified conflict and compliance check."
      />
      <Suspense fallback={<AnalyzeWorkspaceSkeleton />}>
        <SignedInWorkspace />
      </Suspense>
    </>
  );
}
