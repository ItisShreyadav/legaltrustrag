import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/AuthPage";

export const metadata: Metadata = { title: "Create an account · LegalTrustRAG" };

export default function SignupPage() {
  return <AuthPage mode="signup" title="Create an account" lede="Register with your email to review contracts." />;
}
