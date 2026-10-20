/*
 * `output: "standalone"` (next.config.ts) leaves the static assets out of
 * .next/standalone. Copy them in after `next build` (npm's postbuild hook) so
 * `node .next/standalone/server.js` serves a complete app. The Dockerfile copies
 * the same folders explicitly.
 */
import { cpSync, existsSync } from "node:fs";

const standalone = ".next/standalone";

if (existsSync(standalone)) {
  cpSync(".next/static", `${standalone}/.next/static`, { recursive: true });
  if (existsSync("public")) cpSync("public", `${standalone}/public`, { recursive: true });
}
