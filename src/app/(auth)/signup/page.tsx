import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Create an account" };

export default function SignupPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          <h1>Create an account</h1>
        </CardTitle>
        <CardDescription>Register with your email to start reviewing contracts.</CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm mode="signup" />
      </CardContent>
    </Card>
  );
}
