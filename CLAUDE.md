# LegalTrustRAG (Next.js)

Self-verifying RAG for contract conflict detection and compliance checking. Spec: ~/Downloads/LegalTrustRAG_Synopsis.pdf.

## Architecture
Six-stage pipeline, all TypeScript, runs in Next.js route handlers (Node runtime, not edge):
1. `src/lib/parse/`   – PDF/DOCX/TXT -> SourceDocument; section parser -> Clause[] with exact char offsets, definition + exception graph.
2. `src/lib/typing/`  – CUAD category per clause (Claude, batched, structured output).
3. `src/lib/retrieval/` – BM25 + dense (bge-small via @huggingface/transformers) hybrid, reranker, linked exceptions attached.
4. `src/lib/engine/`  – NLI over clause pairs (agree/contradict/exception/not_mentioned) + compliance rules via Claude.
5. `src/lib/verify/`  – relevance gate, exact quote check (string equality at offsets), support check, conflict check, retry, confidence, abstain.
6. `src/lib/report/`  – assemble TrustReport.
`src/lib/pipeline.ts` runs the stages; `src/lib/runs/` saves finished reports, `src/lib/review/` is the human review queue.
UI: a shadcn/ui dashboard. `src/app/(app)/` is the signed-in shell (sidebar + top bar) with the dashboard `/`, `/analyze` (upload, rules, live progress via SSE, report view), `/runs`, `/runs/[id]`, `/review` and `/settings`; `src/app/(auth)/` holds `/login` and `/signup` (centred cards, no sidebar). Feature components live in `src/components/<area>/`; `src/components/ui/` are generated shadcn files (radix-nova preset, `components.json`): regenerate or extend them with the shadcn CLI rather than hand-editing. Light/dark via next-themes.
API: `src/app/api/analyze/route.ts` (SSE), `api/runs`, `api/review`, `api/health`, `api/auth/{signup,login,logout,me,expired}`.
Auth: `src/lib/auth/` (email + password, scrypt hashes, opaque `ltr_session` cookie, users/sessions in `node:sqlite` at `LTR_DB_PATH` or `data/ltr.sqlite`).
`src/proxy.ts` only checks the cookie exists; pages call `requireUser()` and API routes call `getSessionUser()` to validate it. Client code and the proxy import `@/lib/auth/constants`, never `@/lib/auth` (it loads sqlite).
Server config: `src/lib/env.ts` (`getEnv()`, zod-validated, read at request time only); logging: `src/lib/log.ts` (JSON lines); limits: `src/lib/rate-limit.ts` (in-memory, per process); request helpers: `src/lib/http.ts`. Security headers/CSP and `output: "standalone"` are in `next.config.ts`; deployment in `Dockerfile` / `docker-compose.yml` (see README).

## Rules
- All shared shapes live in `src/lib/types.ts`. Import from there; never redefine.
- Quotes must be exact substrings: `doc.text.slice(q.start, q.end) === q.text`. The verifier enforces this.
- Claude via `@anthropic-ai/sdk`; model id from `process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5"`. Load the `claude-api` skill before writing SDK code. Use structured JSON outputs validated with zod.
- Keep each module's public API in its `index.ts`. No cross-module imports except via `index.ts` and `types.ts`.
- Read server config through `getEnv()` from `@/lib/env` in app code (route handlers, server components after a request-time API), never at import time. Pipeline modules may read their own tuning variables directly so the eval scripts work outside Next.js.
- Log with `log` from `@/lib/log`, not `console.*`. Never log secrets, passwords, cookies, file contents or document text.
- Route handlers that change state reject cross-site requests (`isCrossSiteRequest`) and auth responses are `Cache-Control: no-store`.
- `npm run lint` and `npx tsc --noEmit` must pass (`npm run check` runs both).
- Do not run `npm install`. Dependencies are preinstalled: @anthropic-ai/sdk, zod, unpdf, mammoth, @huggingface/transformers, and for the UI shadcn, radix-ui, lucide-react, next-themes, sonner, recharts, @tanstack/react-table, class-variance-authority, cmdk, cn, tw-animate-css. If you truly need another package, note it in your final report instead.
