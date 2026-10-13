import { randomUUID } from "node:crypto";
import type { SessionUser } from "@/lib/types";
import { getDb } from "./db";

export interface UserRecord extends SessionUser {
  passwordHash: string;
}

export class EmailTakenError extends Error {
  constructor() {
    super("An account with this email already exists.");
    this.name = "EmailTakenError";
  }
}

/** Case-insensitive lookup (the column is COLLATE NOCASE). */
export function findUserByEmail(email: string): UserRecord | null {
  const row = getDb().prepare("SELECT id, email, name, password_hash FROM users WHERE email = ?").get(email);
  if (!row) return null;
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    passwordHash: String(row.password_hash),
  };
}

/** Inserts a user; throws EmailTakenError if the email is already registered (in any case). */
export function createUser(input: { name: string; email: string; passwordHash: string }): SessionUser {
  const user: SessionUser = { id: randomUUID(), email: input.email, name: input.name };
  try {
    getDb()
      .prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(user.id, user.email, user.name, input.passwordHash, new Date().toISOString());
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed: users\.email/i.test(err.message)) throw new EmailTakenError();
    throw err;
  }
  return user;
}
