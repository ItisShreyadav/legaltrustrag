import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/AuthPage";

export const metadata: Metadata = { title: "Sign in · LegalTrustRAG" };

export default function LoginPage() {
  return <AuthPage mode="login" title="Sign in" lede="Sign in to continue to contract review." />;
}
