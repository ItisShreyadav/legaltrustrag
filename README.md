# LegalTrustRAG

LegalTrustRAG reads a set of contracts and reports where they contradict each other, where one clause carves an
exception out of another, and whether they satisfy compliance rules you write in plain language. It is built to be
trusted rather than merely fluent: every finding quotes the clauses it relies on, every quote is checked character for
character against the uploaded document, and findings that cannot be verified are withheld instead of shown.

Signed-in users upload 1 to 5 contracts (PDF, DOCX or TXT), optionally add compliance rules (one per line), and watch the
analysis progress live. The result is a trust report: conflicts and exceptions with side-by-side quotes, a compliance
matrix (met, violated, not addressed), the withheld candidates and their failed checks, and run statistics. Every run is
saved, and any finding can be sent to a review queue where a person accepts, rejects or flags it for editing with a note.

> **Not legal advice.** LegalTrustRAG is an aid for review. Its findings are produced by AI models and may be incomplete
> or wrong. Quotes are verified against the source text, but the conclusions drawn from them must be confirmed by a
> qualified lawyer before anyone relies on them.

## How it works

A six-stage pipeline (all TypeScript, running in a Next.js route handler on the Node.js runtime) streams its progress to
the browser over server-sent events:

| Stage | Module | What happens |
|---|---|---|
| 1. Structure | `src/lib/parse` | PDF/DOCX/TXT to normalised text; a section parser splits it into clauses with exact character offsets and builds the definition and exception graph. |
| 2. Type | `src/lib/typing` | Claude assigns each clause one of the 41 CUAD categories (batched, structured output). |
| 3. Retrieve | `src/lib/retrieval` | Hybrid BM25 + dense retrieval (`bge-small-en-v1.5`), cross-encoder reranking (`bge-reranker-base`), linked exceptions and definitions attached; conflict candidate pairs generated. |
| 4. Judge | `src/lib/engine` | Natural-language inference over clause pairs (agree, contradict, exception, not mentioned) and a check of each compliance rule against its retrieved evidence, via Claude. |
| 5. Verify | `src/lib/verify` | Relevance gate, exact quote check, support check, conflict check, retry, combined confidence and abstention. |
| 6. Report | `src/lib/report` | Assemble the `TrustReport`. |

## Requirements

- **Node.js 22.13 or newer** (Node 24 works). The app stores data with the built-in `node:sqlite` module, which needs no
  native add-on but is only available without a flag from Node 22.13.
- An **Anthropic API key** for analyses. Everything else (sign-in, saved runs, reviews) works without one.
- About **1.5 GB of RAM** for the server once the embedding and reranker models are loaded, and network access to
  `huggingface.co` the first time they are downloaded (about 420 MB, cached afterwards). Set
  `LTR_DISABLE_EMBEDDINGS=1` to run BM25-only retrieval without any model download.

## Configuration

Configuration is read from the environment at request time and validated on startup; an invalid value is reported in
the log by name (never by value) and the affected requests fail rather than run with surprising limits.
`.env.example` documents every variable. Copy it to `.env.local` for local development or `.env` for Docker Compose.

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | (unset) | Required to analyse. Without it `/api/analyze` answers 503 and `/api/health` reports `hasApiKey: false`. `ANTHROPIC_AUTH_TOKEN` is accepted instead. |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Claude model for every pipeline stage. |
| `LTR_DB_PATH` | `./data/ltr.sqlite` | SQLite file for users, sessions, runs and reviews. Relative paths resolve against the server's working directory. |
| `LTR_MODEL_CACHE_DIR` | transformers.js default (`node_modules/@huggingface/transformers/.cache`) | On-disk cache for downloaded Hugging Face models. |
| `LTR_ALLOW_SIGNUP` | `true` | `false` closes self-service sign-up (`/api/auth/signup` answers 403). |
| `LTR_COOKIE_SECURE` | on in production | Session cookie `Secure` flag. Set `false` only for production over plain HTTP on a trusted network. |
| `LTR_TRUST_PROXY` | `false` | Number of reverse proxies that append to `X-Forwarded-For` (`true` = 1). Enables per-IP sign-in and sign-up limits. |
| `LTR_MAX_UPLOAD_MB` | `10` | Maximum size of each document (0.1 to 100). |
| `LTR_MAX_FILES` | `5` | Maximum documents per analysis (1 to 20). |
| `LTR_ANALYZE_RATE_LIMIT` | `10` | Analyses per user per hour (`0` = unlimited). |
| `LTR_LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error`. |

Pipeline tuning, also honoured by the evaluation scripts:

| Variable | Default | Purpose |
|---|---|---|
| `LTR_CONCURRENCY` | `4` | Parallel Claude calls per analysis. |
| `LTR_MAX_PAIRS` | no cap | Cap on candidate clause pairs judged per analysis. |
| `LTR_CONFIDENCE_THRESHOLD` | `0.55` | Findings below this combined confidence are withheld. |
| `LTR_FAST_VERIFY` | `0` | `1` replaces the verifier's relevance call to Claude with a lexical check. |
| `LTR_EFFORT` | per call | Claude effort (`low` to `max`), or `none` to omit it. |
| `LTR_FALLBACKS` | `1` | `0` disables server-side refusal fallbacks. |
| `LTR_DISABLE_EMBEDDINGS` | `0` | `1` = BM25-only retrieval, no model downloads. |
| `LTR_RERANK_MODEL` | `Xenova/bge-reranker-base` | Reranker: a Hugging Face id or a local model folder (see `training/README.md`). |
| `LTR_LOCAL_MODELS_DIR` | (unset) | Folder searched for local models before the Hub. |
| `LTR_EMBED_DTYPE` / `LTR_RERANK_DTYPE` | `fp32` / `q8` | ONNX precision of the embedder and reranker. |

## Local development

```bash
npm ci
cp .env.example .env.local   # then set ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

Create the first account at `/signup`. Before opening the server to others, set `LTR_ALLOW_SIGNUP=false` once your
team's accounts exist (re-enable it briefly to add someone).

```bash
npm run check                # eslint + tsc --noEmit
```

## Production build

```bash
npm ci
npm run build                # next build (output: "standalone") + copies static assets into it
```

`next build` writes a self-contained server to `.next/standalone`. Run it with the environment exported in the shell:

```bash
export ANTHROPIC_API_KEY=... LTR_DB_PATH=/var/lib/legaltrustrag/ltr.sqlite LTR_MODEL_CACHE_DIR=/var/lib/legaltrustrag/hf-cache
PORT=3000 HOSTNAME=0.0.0.0 npm run start:standalone   # node .next/standalone/server.js
```

Two things differ from `npm run dev`: the standalone server changes its working directory to `.next/standalone`, and it
only loads `.env` and `.env.production` (copied in at build time), not `.env.local`. Use absolute paths for
`LTR_DB_PATH` and `LTR_MODEL_CACHE_DIR`, outside the build folder, or the next build will replace your data.
`npm start` (`next start`) also serves the build from the project root, with a warning that the standalone server is
preferred.

## Docker

The `Dockerfile` is a multi-stage build on `node:22-bookworm-slim`: `npm ci`, `next build` with standalone output, and a
runtime stage that contains only the traced server files and runs as the unprivileged `node` user. It has a
`HEALTHCHECK` against `/api/health`.

```bash
cp .env.example .env         # set ANTHROPIC_API_KEY
docker compose up -d --build # http://localhost:3000
```

or without Compose:

```bash
docker build -t legaltrustrag .
docker run -d -p 3000:3000 --env-file .env -v ltr-data:/app/data --name legaltrustrag legaltrustrag
```

`.env` files are excluded from the build context, so secrets are never baked into the image; pass them at run time.

## Data and persistence

Everything stateful lives under one directory, `/app/data` in the container (a Docker volume) or `./data` locally:

| Path | Contents |
|---|---|
| `ltr.sqlite` (`LTR_DB_PATH`) | Users (scrypt password hashes), sessions (SHA-256 of the token only), saved runs including the full text of the uploaded documents, and review decisions. SQLite runs in WAL mode, so back up the `-wal` and `-shm` files with it, or use `sqlite3 ltr.sqlite ".backup backup.sqlite"`. |
| `hf-cache/` (`LTR_MODEL_CACHE_DIR`) | Downloaded embedding and reranker models. Safe to delete; they are fetched again on the next analysis. |

Uploaded files themselves are not kept: they are parsed in memory and only the extracted text is stored with the run.
Deleting a run deletes its stored text and reviews.

## Health checks

`GET /api/health` answers `{ "ok": true }` to anyone (use it for liveness probes). For a signed-in user it also reports
whether an API key is configured, the model id, the upload limits, database reachability and whether the embedding and
reranker models are cached and loaded. Configuration details are never exposed to anonymous callers.

## Evaluation

The evaluation harness (ContractConflict test set, LegalBench-RAG retrieval, end-to-end runs against a no-verification
baseline, the coverage-versus-accuracy curve and a factorial ablation) is documented in [`eval/README.md`](eval/README.md):

```bash
npm run eval:all -- --quick  # small limits, dry runs where Claude is needed and no key is set
npm run eval:all             # full run, writes eval/results/REPORT.md
```

Individual steps are `npm run eval:dataset`, `eval:review`, `eval:agreement`, `eval:retrieval`, `eval:pairs`, `eval:e2e`,
`eval:curve` and `eval:ablate`. Fine-tuning the legal reranker is covered in [`training/README.md`](training/README.md).

## Security

- **Accounts and sessions.** Passwords are hashed with scrypt (N=16384, r=8, p=1). The session cookie `ltr_session` is an
  opaque random token (HttpOnly, SameSite=Lax, Secure in production, 30 days); the database stores only its SHA-256, and
  signing in rotates it. Unknown emails cost the same scrypt work as wrong passwords, so timing does not reveal which
  accounts exist.
- **Rate limits.** Failed sign-ins: 10 per email and 50 per client IP per 15 minutes. Sign-ups: 10 per client IP per hour
  (50 per hour in total when the client IP is unknown). Analyses: `LTR_ANALYZE_RATE_LIMIT` per user per hour, and at most
  2 running at once per user. Limited requests get HTTP 429 with `Retry-After`. Per-IP limits need `LTR_TRUST_PROXY`.
- **Uploads.** At most `LTR_MAX_FILES` files of `LTR_MAX_UPLOAD_MB` each, PDF, DOCX or TXT only. Oversized bodies are
  rejected from `Content-Length` before parsing, and chunked bodies are cut off once they pass the limit (HTTP 413).
  Text is extracted in memory; scanned PDFs without a text layer are rejected.
- **Requests.** State-changing routes reject cross-site browser requests (Fetch Metadata), auth and health responses
  are `Cache-Control: no-store`, and production error responses never include internal messages or stack traces: a
  failed analysis reports a `requestId` that matches the server log line.
- **Headers.** Every response carries a Content-Security-Policy (`default-src 'self'`, no third-party origins,
  `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: DENY`, `Permissions-Policy` (camera, microphone and geolocation off) and
  `Cross-Origin-Opener-Policy: same-origin`. `X-Powered-By` is off. Set HSTS at your TLS terminator.
- **Logs** are JSON lines on stdout/stderr with ids, counts and durations. They never contain passwords, tokens, file
  contents or document text.
- **Data sent to Anthropic.** Clause text and your rules are sent to the Claude API for typing, judging and
  verification. Review your agreement with Anthropic before analysing confidential documents.
- Everything in `public/` is served to anyone. Keep exported reranker models out of it in production: mount them
  elsewhere and point `LTR_RERANK_MODEL` or `LTR_LOCAL_MODELS_DIR` at that folder.

Put a reverse proxy with TLS in front of the server. Disable response buffering for `/api/analyze` (the app sends
`X-Accel-Buffering: no` for nginx), allow request bodies of at least `LTR_MAX_FILES` x `LTR_MAX_UPLOAD_MB` plus 1 MB, and
allow responses to stream for several minutes.

## Scaling

The server is designed to run as **one instance**:

- **SQLite** is a single local file. Several processes on one host can share it, but it must not sit on a network file
  system, and instances on different hosts cannot share it. Moving to more than one host means replacing
  `src/lib/auth/db.ts` (and the run and review stores) with a networked database.
- **Rate limits and the running-analysis count are in memory**, per process. They reset on restart and are not shared,
  so N instances allow N times the configured limits. A shared store (for example Redis) is needed behind a load
  balancer.
- **Models are loaded once per process** (roughly 500 MB of memory for the embedder and the reranker) and the clause
  embedding cache is per process too.
- **Analyses run inside the request.** A run takes from tens of seconds to several minutes and keeps going (and is saved)
  if the browser disconnects. `maxDuration` is 300 seconds on platforms that enforce it; self-hosted Node has no limit.
  Scale vertically (CPU for embeddings, `LTR_CONCURRENCY` for Claude throughput) before adding instances.
- Next.js itself also needs a shared cache handler, the same `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` and a `deploymentId`
  when running several instances; see the Next.js self-hosting guide.
