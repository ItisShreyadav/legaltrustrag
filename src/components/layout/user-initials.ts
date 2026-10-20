/** "Ada Lovelace" -> "AL", "ada@example.com" -> "A". At most two letters, upper-case. */
export function userInitials(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length >= 2 ? `${words[0][0]}${words[words.length - 1][0]}` : (words[0]?.[0] ?? email.trim()[0] ?? "?");
  return letters.toUpperCase();
}
