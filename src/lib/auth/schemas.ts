import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "./constants";

// Generous upper bounds keep scrypt and the database away from absurd inputs.
const email = z.string().trim().toLowerCase().max(254, "That email address is too long.");
const password = z.string().max(256, "Use at most 256 characters for the password.");

export const SignupInput = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100, "Use at most 100 characters for your name."),
  email: email.pipe(z.email("Enter a valid email address.")),
  password: password.min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`),
});

export const LoginInput = z.object({
  email: email.min(1, "Enter your email address."),
  password: password.min(1, "Enter your password."),
});

export type SignupInput = z.infer<typeof SignupInput>;
export type LoginInput = z.infer<typeof LoginInput>;
