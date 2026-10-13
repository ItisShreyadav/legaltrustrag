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
UI: `src/app/` (upload, rules textarea, live progress via SSE, report view). API: `src/app/api/analyze/route.ts`.

## Rules
- All shared shapes live in `src/lib/types.ts`. Import from there; never redefine.
- Quotes must be exact substrings: `doc.text.slice(q.start, q.end) === q.text`. The verifier enforces this.
- Claude via `@anthropic-ai/sdk`; model id from `process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5"`. Load the `claude-api` skill before writing SDK code. Use structured JSON outputs validated with zod.
- Keep each module's public API in its `index.ts`. No cross-module imports except via `index.ts` and `types.ts`.
- `npm run lint` and `npx tsc --noEmit` must pass.
- Do not run `npm install` (deps are preinstalled: @anthropic-ai/sdk, zod, unpdf, mammoth, @huggingface/transformers). If you truly need another package, note it in your final report instead.
