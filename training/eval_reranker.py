#!/usr/bin/env python3
"""Held-out evaluation of rerankers on the LegalBench-RAG validation split built by prepare_data.py.

Each validation query comes with BM25-ranked candidate chunks (val.jsonl "candidates"). A reranker
re-scores those candidates; we report, against the same candidate lists:

  P@1     share of queries whose top-ranked chunk overlaps a gold span
  R@10    relevant chunks in the top 10 / all relevant chunks of the gold document (macro-averaged;
          relevant chunks BM25 did not retrieve count as misses, so this is two-stage recall)
  MRR@10  mean reciprocal rank of the first relevant chunk within the top 10
  R@all   recall of the whole candidate list = the ceiling any reranker can reach

for BM25 order and for every model given, overall and per sub-benchmark, and prints a Markdown
table for the project report.

Models
  --model PATH_OR_HF_ID   a CrossEncoder checkpoint (e.g. training/out/legal-reranker or
                          BAAI/bge-reranker-base); repeatable
  --onnx DIR              an exported transformers.js folder (export_onnx.py); evaluates
                          onnx/model.onnx and onnx/model_quantized.onnx with onnxruntime (CPU), i.e.
                          exactly the weights the Next.js app will load; repeatable. CPU inference of a
                          278M-parameter cross-encoder is slow (thousands of pairs = tens of minutes on a
                          2-vCPU Colab VM), so check ONNX parity on a subset: --limit 20 --top-candidates 10

Examples
  python training/eval_reranker.py --data training/data/mini \
      --model BAAI/bge-reranker-base --model training/out/legal-reranker
  python training/eval_reranker.py --data training/data/mini --model training/out/legal-reranker \
      --onnx public/models/legal-reranker --limit 20 --top-candidates 10 --no-fp16
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Callable, Sequence

import numpy as np

HERE = Path(__file__).resolve().parent
DEFAULT_DATA = HERE / "data" / "mini"
BASE_MODEL = "BAAI/bge-reranker-base"

ScoreFn = Callable[[Sequence[tuple[str, str]]], np.ndarray]


# ----------------------------------------------------------------------------------------------
# Data + metrics (also imported by train_reranker.py)
# ----------------------------------------------------------------------------------------------


def load_jsonl(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def load_val(data_dir: Path, limit: int = 0, top_candidates: int = 0) -> list[dict]:
    """Validation records with BM25 candidates; optionally the first `limit` queries / `top_candidates` per query."""
    rows = [r for r in load_jsonl(data_dir / "val.jsonl") if r.get("candidates")]
    if not rows:
        sys.exit(f"{data_dir / 'val.jsonl'}: no validation records with candidates; run prepare_data.py first")
    if limit:
        rows = rows[:limit]
    if top_candidates:
        for r in rows:
            r["candidates"] = r["candidates"][:top_candidates]
    return rows


def ranking_metrics(records: list[dict], scores: list[np.ndarray] | None, k: int = 10) -> dict:
    """P@1, R@k, MRR@k, R@all for BM25 order (scores=None) or model scores; overall + per benchmark."""
    buckets: dict[str, list[tuple[float, float, float, float]]] = defaultdict(list)
    for n, rec in enumerate(records):
        cands = rec["candidates"]
        if scores is None:
            order = list(range(len(cands)))
        else:
            s = scores[n]
            order = sorted(range(len(cands)), key=lambda i: (-float(s[i]), i))  # ties keep BM25 order
        rel = [bool(cands[i]["relevant"]) for i in order]
        total = max(int(rec.get("num_relevant") or 0), sum(rel), 1)
        p1 = float(rel[0]) if rel else 0.0
        rk = sum(rel[:k]) / total
        mrr = next((1.0 / (i + 1) for i, r in enumerate(rel[:k]) if r), 0.0)
        rall = sum(rel) / total
        for b in ("all", rec.get("benchmark", "?")):
            buckets[b].append((p1, rk, mrr, rall))
    out: dict[str, dict] = {}
    for b, vals in buckets.items():
        arr = np.array(vals, dtype=float)
        out[b] = {
            "queries": len(vals),
            "P@1": round(float(arr[:, 0].mean()), 4),
            f"R@{k}": round(float(arr[:, 1].mean()), 4),
            f"MRR@{k}": round(float(arr[:, 2].mean()), 4),
            "R@all": round(float(arr[:, 3].mean()), 4),
        }
    return out


def score_records(records: list[dict], score_fn: ScoreFn) -> list[np.ndarray]:
    """Score every (query, candidate) pair in one batched call, then split back per query."""
    pairs = [(r["query"], c["text"]) for r in records for c in r["candidates"]]
    flat = np.asarray(score_fn(pairs), dtype=np.float32).reshape(-1)
    out, pos = [], 0
    for r in records:
        n = len(r["candidates"])
        out.append(flat[pos : pos + n])
        pos += n
    return out


def evaluate(records: list[dict], score_fn: ScoreFn | None, k: int = 10) -> dict:
    if score_fn is None:
        return ranking_metrics(records, None, k)
    return ranking_metrics(records, score_records(records, score_fn), k)


def cross_encoder_scorer(model, batch_size: int = 64, amp: bool = False) -> ScoreFn:
    """model.predict over all pairs; amp=True runs it under CUDA fp16 autocast (fp32 weights, ~4x faster on a T4)."""
    import contextlib

    import torch

    def fn(pairs: Sequence[tuple[str, str]]) -> np.ndarray:
        ctx = torch.autocast("cuda", dtype=torch.float16) if amp and torch.cuda.is_available() else contextlib.nullcontext()
        with ctx:
            out = model.predict(list(pairs), batch_size=batch_size, show_progress_bar=len(pairs) > 2000, convert_to_numpy=True)
        return np.asarray(out, dtype=np.float32)

    return fn


def format_table(results: dict[str, dict], k: int = 10) -> str:
    """Markdown table: one row per system, overall metrics plus P@1 per sub-benchmark."""
    benches = sorted({b for r in results.values() for b in r if b != "all"})
    head = ["System", "P@1", f"R@{k}", f"MRR@{k}", "R@all"] + [f"P@1 {b}" for b in benches]
    lines = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    for name, r in results.items():
        a = r["all"]
        row = [name, f"{100 * a['P@1']:.1f}", f"{100 * a[f'R@{k}']:.1f}", f"{100 * a[f'MRR@{k}']:.1f}", f"{100 * a['R@all']:.1f}"]
        row += [f"{100 * r[b]['P@1']:.1f}" if b in r else "-" for b in benches]
        lines.append("| " + " | ".join(row) + " |")
    n = next(iter(results.values()))["all"]["queries"] if results else 0
    lines.append(f"\n{n} held-out queries; numbers in %. R@all = recall of the BM25 candidate list (reranker ceiling).")
    return "\n".join(lines)


# ----------------------------------------------------------------------------------------------
# Model loaders
# ----------------------------------------------------------------------------------------------


def load_cross_encoder(name: str, max_length: int = 512, fp16: bool | None = None):
    import torch
    from sentence_transformers import CrossEncoder

    model = CrossEncoder(name, num_labels=1, max_length=max_length)
    if fp16 is None:
        fp16 = torch.cuda.is_available()
    if fp16 and torch.cuda.is_available():
        model.half()
    return model


def onnx_scorer(model_dir: Path, onnx_file: str, batch_size: int = 32, max_length: int = 512) -> ScoreFn:
    import onnxruntime as ort
    from transformers import AutoTokenizer

    tok = AutoTokenizer.from_pretrained(str(model_dir))
    sess = ort.InferenceSession(str(model_dir / "onnx" / onnx_file), providers=["CPUExecutionProvider"])
    names = {i.name for i in sess.get_inputs()}

    def fn(pairs: Sequence[tuple[str, str]]) -> np.ndarray:
        # Batch pairs of similar length together: padding to 512 tokens dominates CPU time otherwise.
        order = sorted(range(len(pairs)), key=lambda i: len(pairs[i][0]) + len(pairs[i][1]))
        out = np.zeros(len(pairs), dtype=np.float32)
        for b in range(0, len(order), batch_size):
            idx = order[b : b + batch_size]
            enc = tok([pairs[i][0] for i in idx], [pairs[i][1] for i in idx], padding=True, truncation=True, max_length=max_length, return_tensors="np")
            feeds = {k: v.astype(np.int64) for k, v in enc.items() if k in names}
            out[idx] = sess.run(None, feeds)[0].reshape(len(idx), -1)[:, 0]
        return out

    return fn


# ----------------------------------------------------------------------------------------------
# CLI
# ----------------------------------------------------------------------------------------------


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=DEFAULT_DATA, help="folder with val.jsonl (default training/data/mini)")
    ap.add_argument("--model", action="append", default=[], help="CrossEncoder checkpoint dir or HF id (repeatable)")
    ap.add_argument("--onnx", action="append", type=Path, default=[], help="exported transformers.js folder (repeatable)")
    ap.add_argument("--onnx-files", nargs="+", default=["model.onnx", "model_quantized.onnx"])
    ap.add_argument("--k", type=int, default=10)
    ap.add_argument("--batch-size", type=int, default=64)
    ap.add_argument("--max-length", type=int, default=512)
    ap.add_argument("--no-fp16", action="store_true", help="keep fp32 on GPU")
    ap.add_argument("--limit", type=int, default=0, help="only the first N validation queries (smoke tests, ONNX parity on CPU)")
    ap.add_argument("--top-candidates", type=int, default=0, help="rerank only the first N BM25 candidates per query (0 = all)")
    ap.add_argument("--out", type=Path, default=None, help="write results JSON + Markdown here (default <first model or onnx dir>/eval_results.json)")
    args = ap.parse_args()

    if not args.model and not args.onnx:
        args.model = [BASE_MODEL]
    records = load_val(args.data, args.limit, args.top_candidates)
    n_cands = sum(len(r["candidates"]) for r in records)
    print(f"[eval] {len(records)} validation queries, {n_cands} candidate pairs from {args.data}")

    results: dict[str, dict] = {"BM25": evaluate(records, None, args.k)}
    timings: dict[str, float] = {}
    for name in args.model:
        t0 = time.time()
        label = Path(name).name if Path(name).is_dir() else name
        model = load_cross_encoder(name, args.max_length, fp16=not args.no_fp16)
        results[label] = evaluate(records, cross_encoder_scorer(model, args.batch_size), args.k)
        timings[label] = round(time.time() - t0, 1)
        del model
    for d in args.onnx:
        for f in args.onnx_files:
            if not (d / "onnx" / f).exists():
                print(f"[eval] skip {d / 'onnx' / f}: not found")
                continue
            t0 = time.time()
            label = f"{d.name} onnx/{f}"
            results[label] = evaluate(records, onnx_scorer(d, f, min(args.batch_size, 32), args.max_length), args.k)
            timings[label] = round(time.time() - t0, 1)

    table = format_table(results, args.k)
    print()
    print(table)
    print(json.dumps(results, indent=2))

    out = args.out
    if out is None:
        first = args.model[0] if args.model else str(args.onnx[0])
        out = Path(first) / "eval_results.json" if Path(first).is_dir() else HERE / "out" / "eval_results.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {"data": str(args.data), "queries": len(records), "k": args.k, "results": results, "seconds": timings}
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    out.with_suffix(".md").write_text(table + "\n", encoding="utf-8")
    print(f"[eval] wrote {out} and {out.with_suffix('.md')}")


if __name__ == "__main__":
    main()
