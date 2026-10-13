#!/usr/bin/env python3
"""Fine-tune BAAI/bge-reranker-base on LegalBench-RAG (query, chunk) pairs -> the LegalTrustRAG legal reranker.

Input:  training/data/<variant>/{train,val}.jsonl from prepare_data.py
Model:  sentence-transformers CrossEncoder, 1 output logit, max_length 512
Loss:   BinaryCrossEntropyLoss (positives = 1; BM25 hard negatives + random negatives = 0)
Setup:  lr 2e-5, batch 16, 2 epochs, 10% linear warmup, fp16 on CUDA (T4: ~1-2 min/epoch on mini,
        ~10 min/epoch on --full data)
Eval:   CrossEncoderRerankingEvaluator (the successor of CERerankingEvaluator) on the held-out BM25
        candidate lists, MRR@10 picks the best epoch; then P@1 / R@10 / MRR@10 of the reranked BM25
        candidates for BM25, the untuned base model and the fine-tuned model (eval_reranker.py metrics).
Output: training/out/legal-reranker/  (best checkpoint, HF format + eval_results.json/.md)
        training/out/checkpoints/     (per-epoch trainer checkpoints, safe to delete)

Usage
  python training/train_reranker.py                                   # mini data, 2 epochs
  python training/train_reranker.py --data training/data/full --epochs 1
"""

from __future__ import annotations

import argparse
import inspect
import json
import random
import shutil
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent


def build_pairs(rows: list[dict], use_random: bool = True) -> dict[str, list]:
    queries, passages, labels = [], [], []
    for r in rows:
        negs = r["hard_negatives"] + (r["random_negatives"] if use_random else [])
        for p in r["positives"]:
            queries.append(r["query"])
            passages.append(p)
            labels.append(1.0)
        for n in negs:
            queries.append(r["query"])
            passages.append(n)
            labels.append(0.0)
    return {"query": queries, "passage": passages, "label": labels}


def evaluator_samples(rows: list[dict]) -> list[dict]:
    """CrossEncoderRerankingEvaluator samples: BM25-ranked 'documents' + 'positive' texts."""
    samples = []
    for r in rows:
        docs = [c["text"] for c in r["candidates"]]
        pos = list(dict.fromkeys([c["text"] for c in r["candidates"] if c["relevant"]] + r["positives"]))
        samples.append({"query": r["query"], "positive": pos, "documents": docs})
    return samples


def training_args(cls, **kw):
    """Build CrossEncoderTrainingArguments across transformers 4.x (warmup_ratio) and 5.x (float warmup_steps)."""
    import transformers

    params = inspect.signature(cls).parameters
    ratio = kw.pop("warmup_ratio")
    if int(transformers.__version__.split(".")[0]) >= 5 or "warmup_ratio" not in params:
        kw["warmup_steps"] = ratio  # v5: a float in [0, 1) is a ratio of total steps
    else:
        kw["warmup_ratio"] = ratio
    if "eval_strategy" not in params and "evaluation_strategy" in params:
        kw["evaluation_strategy"] = kw.pop("eval_strategy")
    return cls(**kw)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", type=Path, default=HERE / "data" / "mini", help="folder with train.jsonl / val.jsonl")
    ap.add_argument("--base-model", default="BAAI/bge-reranker-base")
    ap.add_argument("--out", type=Path, default=HERE / "out" / "legal-reranker", help="where the best checkpoint is saved")
    ap.add_argument("--checkpoints", type=Path, default=HERE / "out" / "checkpoints")
    ap.add_argument("--epochs", type=float, default=2)
    ap.add_argument("--lr", type=float, default=2e-5)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--eval-batch-size", type=int, default=64)
    ap.add_argument("--max-length", type=int, default=512)
    ap.add_argument("--warmup", type=float, default=0.1, help="warmup as a fraction of total steps")
    ap.add_argument("--pos-weight", type=float, default=0.0, help="BCE pos_weight (0 = unweighted)")
    ap.add_argument("--no-random-negatives", action="store_true", help="train on hard negatives only")
    ap.add_argument("--no-fp16", action="store_true")
    ap.add_argument("--eval-steps", type=int, default=0, help="evaluate/save every N steps instead of every epoch")
    ap.add_argument("--max-steps", type=int, default=-1, help="stop after N optimizer steps (smoke tests)")
    ap.add_argument("--limit-train", type=int, default=0, help="use only N training queries (smoke tests)")
    ap.add_argument("--limit-val", type=int, default=0, help="use only N validation queries (smoke tests)")
    ap.add_argument("--skip-baseline", action="store_true", help="do not score the untuned base model")
    ap.add_argument("--seed", type=int, default=13)
    args = ap.parse_args()

    import torch
    from datasets import Dataset
    from sentence_transformers.cross_encoder import CrossEncoder, CrossEncoderTrainer, CrossEncoderTrainingArguments
    from sentence_transformers.cross_encoder.losses import BinaryCrossEntropyLoss

    try:  # sentence-transformers >= 4
        from sentence_transformers.cross_encoder.evaluation import CrossEncoderRerankingEvaluator as RerankEval
    except ImportError:  # pragma: no cover - older releases only ship the deprecated name
        from sentence_transformers.cross_encoder.evaluation import CERerankingEvaluator as RerankEval

    class AmpRerankEval(RerankEval):
        """Same metrics, scored under CUDA fp16 autocast so per-epoch evaluation stays cheap on a T4."""

        def __call__(self, model, *a, **kw):
            with torch.autocast("cuda", dtype=torch.float16, enabled=torch.cuda.is_available() and not args.no_fp16):
                return super().__call__(model, *a, **kw)

    from transformers import set_seed

    import eval_reranker as ev

    set_seed(args.seed)
    random.seed(args.seed)
    cuda = torch.cuda.is_available()
    fp16 = cuda and not args.no_fp16
    print(f"[train] device={'cuda:' + torch.cuda.get_device_name(0) if cuda else 'cpu'} fp16={fp16}")

    train_rows = ev.load_jsonl(args.data / "train.jsonl")
    if args.limit_train:
        train_rows = train_rows[: args.limit_train]
    val_rows = ev.load_val(args.data, args.limit_val)
    pairs = build_pairs(train_rows, use_random=not args.no_random_negatives)
    n_pos = int(sum(pairs["label"]))
    print(f"[train] {len(train_rows)} train queries -> {len(pairs['label'])} pairs ({n_pos} positive); {len(val_rows)} val queries")
    train_ds = Dataset.from_dict(pairs).shuffle(seed=args.seed)

    model = CrossEncoder(args.base_model, num_labels=1, max_length=args.max_length)

    results: dict[str, dict] = {"BM25": ev.evaluate(val_rows, None)}
    timings: dict[str, float] = {}
    if not args.skip_baseline:
        t0 = time.time()
        model.eval()
        base_label = Path(args.base_model).name if Path(args.base_model).is_dir() else args.base_model
        results[f"{base_label} (untuned)"] = ev.evaluate(val_rows, ev.cross_encoder_scorer(model, args.eval_batch_size, amp=fp16))
        timings["baseline_eval_s"] = round(time.time() - t0, 1)
        print(ev.format_table(results))

    name = "legalbench-val"
    evaluator = AmpRerankEval(
        samples=evaluator_samples(val_rows),
        at_k=10,
        always_rerank_positives=False,  # realistic: positives BM25 missed stay missed
        name=name,
        batch_size=args.eval_batch_size,
    )
    loss = BinaryCrossEntropyLoss(model, pos_weight=torch.tensor(args.pos_weight) if args.pos_weight > 0 else None)

    strategy = "steps" if args.eval_steps else "epoch"
    targs = training_args(
        CrossEncoderTrainingArguments,
        output_dir=str(args.checkpoints),
        num_train_epochs=args.epochs,
        max_steps=args.max_steps,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.eval_batch_size,
        learning_rate=args.lr,
        warmup_ratio=args.warmup,
        fp16=fp16,
        eval_strategy=strategy,
        save_strategy=strategy,
        **({"eval_steps": args.eval_steps, "save_steps": args.eval_steps} if args.eval_steps else {}),
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model=f"eval_{name}_mrr@10",
        greater_is_better=True,
        logging_steps=25,
        report_to="none",
        seed=args.seed,
        dataloader_drop_last=False,
    )
    trainer = CrossEncoderTrainer(model=model, args=targs, train_dataset=train_ds, loss=loss, evaluator=evaluator)

    t0 = time.time()
    trainer.train()
    timings["train_s"] = round(time.time() - t0, 1)
    best = trainer.state.best_model_checkpoint
    print(f"[train] done in {timings['train_s']}s; best checkpoint: {best} ({trainer.state.best_metric})")

    model = trainer.model
    model.eval()
    if args.out.exists():
        if any(args.out.iterdir()) and not ((args.out / "config.json").exists() or (args.out / "modules.json").exists()):
            sys.exit(f"--out {args.out} exists and is not a model folder; refusing to overwrite it")
        shutil.rmtree(args.out)
    model.save_pretrained(str(args.out))
    print(f"[train] saved best model to {args.out}")

    t0 = time.time()
    results["legal-reranker (fine-tuned)"] = ev.evaluate(val_rows, ev.cross_encoder_scorer(model, args.eval_batch_size, amp=fp16))
    timings["final_eval_s"] = round(time.time() - t0, 1)
    per_epoch = [
        {k.replace(f"eval_{name}_", ""): v for k, v in h.items() if k.startswith(f"eval_{name}_") or k in ("epoch", "step")}
        for h in trainer.state.log_history
        if f"eval_{name}_mrr@10" in h
    ]

    table = ev.format_table(results)
    print()
    print(table)
    payload = {
        "base_model": args.base_model,
        "data": str(args.data),
        "train_queries": len(train_rows),
        "train_pairs": len(pairs["label"]),
        "val_queries": len(val_rows),
        "hyperparameters": {
            "epochs": args.epochs, "lr": args.lr, "batch_size": args.batch_size, "max_length": args.max_length,
            "warmup": args.warmup, "fp16": fp16, "pos_weight": args.pos_weight, "seed": args.seed,
            "random_negatives": not args.no_random_negatives, "max_steps": args.max_steps,
        },
        "best_checkpoint": best,
        "best_metric": trainer.state.best_metric,
        "reranking_evaluator_per_eval": per_epoch,  # MRR@10 / NDCG@10 / MAP, base_* = BM25 order
        "results": results,
        "seconds": timings,
        "log_history": trainer.state.log_history,
    }
    (args.out / "eval_results.json").write_text(json.dumps(payload, indent=2, default=str) + "\n", encoding="utf-8")
    (args.out / "eval_results.md").write_text(table + "\n", encoding="utf-8")
    print(f"[train] wrote {args.out / 'eval_results.json'}")


if __name__ == "__main__":
    main()
