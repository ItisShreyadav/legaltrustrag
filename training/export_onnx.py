#!/usr/bin/env python3
"""Export a (fine-tuned) cross-encoder reranker to the folder layout transformers.js loads.

  python training/export_onnx.py                                   # training/out/legal-reranker -> public/models/legal-reranker
  python training/export_onnx.py --model BAAI/bge-reranker-base --out /tmp/bge-reranker-base
  python training/export_onnx.py --model training/out/legal-reranker --out models/legal-reranker

Resulting folder (what `AutoModelForSequenceClassification.from_pretrained(<dir>)` in
@huggingface/transformers expects for a local model):

  <out>/
    config.json               model config (XLMRobertaForSequenceClassification, num_labels=1)
    tokenizer.json            fast tokenizer (required by transformers.js)
    tokenizer_config.json     tokenizer settings (model_max_length 512, special tokens)
    special_tokens_map.json   (if the tokenizer writes one; unused by transformers.js)
    export_info.json          source checkpoint, opset, exporter, quantization, parity checks
    onnx/
      model.onnx              fp32 graph, inputs input_ids/attention_mask, output logits [batch, 1]
                              -> loaded for dtype "fp32"                     (~1.1 GB for bge-reranker-base)
      model_quantized.onnx    dynamic int8 (onnxruntime quantize_dynamic, QInt8 weights)
                              -> loaded for dtype "q8", the app's default     (~280 MB)

Export path: torch.onnx.export (TorchScript exporter, opset 17, falling back to the dynamo exporter
when the legacy one is unavailable), then onnxruntime.quantization.quantize_dynamic -- the same
dynamic int8 scheme optimum's ORTQuantizer and the transformers.js conversion script use. Optimum
itself is not required (see requirements.txt). Both graphs are checked against PyTorch logits.

Use it from the app with either
  LTR_RERANK_MODEL=public/models/legal-reranker          (a directory path), or
  LTR_LOCAL_MODELS_DIR=public/models LTR_RERANK_MODEL=legal-reranker
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
DEFAULT_MODEL = HERE / "out" / "legal-reranker"
DEFAULT_OUT = REPO / "public" / "models" / "legal-reranker"

SAMPLE_PAIRS = [
    ("What is the governing law?", "This Agreement shall be governed by and construed in accordance with the laws of the State of New York."),
    ("What is the governing law?", "The Receiving Party shall return all Confidential Information within thirty (30) days."),
    ("Can the agreement be terminated for convenience?", "Either party may terminate this Agreement at any time, for any reason, upon ninety (90) days prior written notice."),
    ("Is there a cap on liability?", "IN NO EVENT SHALL EITHER PARTY'S AGGREGATE LIABILITY EXCEED THE FEES PAID IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM."),
]


def resolve_hf_dir(model: str) -> str:
    """A sentence-transformers save keeps the HF weights in the root (or the first module folder)."""
    p = Path(model)
    if not p.is_dir():
        return model  # Hugging Face Hub id
    modules = p / "modules.json"
    if (p / "config.json").exists() or not modules.exists():
        return str(p)
    for m in json.loads(modules.read_text()):
        sub = p / m.get("path", "")
        if (sub / "config.json").exists():
            return str(sub)
    sys.exit(f"{model}: no config.json found (not a transformers / CrossEncoder checkpoint?)")


class LogitsOnly:
    """Wrap the HF model so the exported graph has exactly the inputs transformers.js feeds."""

    def __new__(cls, model):
        import torch

        class _M(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.model = model

            def forward(self, input_ids, attention_mask, token_type_ids=None):
                extra = {} if token_type_ids is None else {"token_type_ids": token_type_ids}
                return self.model(input_ids=input_ids, attention_mask=attention_mask, **extra).logits

        return _M().eval()


def export_onnx(model, input_names, dummy, path: Path, opset: int, exporter: str) -> str:
    import torch

    wrapped = LogitsOnly(model)
    args = tuple(dummy[n] for n in input_names)
    errors = []
    order = ["torchscript", "dynamo"] if exporter == "auto" else [exporter]
    for kind in order:
        try:
            with torch.no_grad():
                if kind == "torchscript":
                    dyn = {n: {0: "batch_size", 1: "sequence_length"} for n in input_names}
                    dyn["logits"] = {0: "batch_size"}
                    torch.onnx.export(
                        wrapped, args, str(path), input_names=input_names, output_names=["logits"],
                        dynamic_axes=dyn, opset_version=opset, do_constant_folding=True, dynamo=False,
                    )
                else:
                    dim = torch.export.Dim.DYNAMIC
                    shapes = {n: {0: dim, 1: dim} for n in input_names}
                    torch.onnx.export(
                        wrapped, args, str(path), input_names=input_names, output_names=["logits"],
                        dynamic_shapes=shapes, opset_version=max(opset, 18), dynamo=True, external_data=False,
                    )
            return kind
        except Exception as e:  # noqa: BLE001 - try the next exporter, report all failures
            errors.append(f"{kind}: {type(e).__name__}: {e}")
            for leftover in path.parent.glob(path.name + "*"):
                leftover.unlink()
    sys.exit("ONNX export failed:\n  " + "\n  ".join(errors))


def onnx_logits(path: Path, feeds: dict[str, np.ndarray]) -> np.ndarray:
    import onnxruntime as ort

    sess = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    names = {i.name for i in sess.get_inputs()}
    return sess.run(None, {k: v for k, v in feeds.items() if k in names})[0]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default=str(DEFAULT_MODEL), help="checkpoint dir (train_reranker.py output) or HF id")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output folder (default public/models/legal-reranker)")
    ap.add_argument("--opset", type=int, default=17)
    ap.add_argument("--exporter", choices=["auto", "torchscript", "dynamo"], default="auto")
    ap.add_argument("--no-quantize", action="store_true", help="skip onnx/model_quantized.onnx")
    ap.add_argument("--quant-type", choices=["qint8", "quint8"], default="qint8", help="weight type for dynamic quantization")
    ap.add_argument("--per-channel", action="store_true", help="per-channel weight quantization (slightly more accurate, bigger)")
    ap.add_argument("--keep-existing", action="store_true", help="do not wipe --out before exporting")
    args = ap.parse_args()

    import torch
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    src = resolve_hf_dir(args.model)
    print(f"[export] loading {src}")
    tokenizer = AutoTokenizer.from_pretrained(src)
    if not getattr(tokenizer, "is_fast", False):
        sys.exit("a fast tokenizer (tokenizer.json) is required by transformers.js")
    model = AutoModelForSequenceClassification.from_pretrained(src).float().eval()
    if model.config.num_labels != 1:
        print(f"[export] warning: num_labels={model.config.num_labels}; the app reads logit[0] as the relevance score")

    out: Path = args.out
    if out.exists() and not args.keep_existing:
        if any(out.iterdir()) and not ((out / "config.json").exists() or (out / "onnx").is_dir()):
            sys.exit(f"--out {out} exists and does not look like a model folder; refusing to wipe it")
        shutil.rmtree(out)
    (out / "onnx").mkdir(parents=True, exist_ok=True)
    model.config.save_pretrained(str(out))
    tokenizer.save_pretrained(str(out))
    if not (out / "tokenizer.json").exists():
        sys.exit("tokenizer.json was not written; transformers.js cannot load this tokenizer")

    # Batch of 2 with padding so batch and sequence axes are both traced as dynamic.
    qs, ps = zip(*SAMPLE_PAIRS)
    enc = tokenizer(list(qs), list(ps), padding=True, truncation=True, max_length=512, return_tensors="pt")
    input_names = [n for n in ("input_ids", "attention_mask", "token_type_ids") if n in enc]
    dummy = {n: enc[n][:2] for n in input_names}

    fp32_path = out / "onnx" / "model.onnx"
    kind = export_onnx(model, input_names, dummy, fp32_path, args.opset, args.exporter)
    print(f"[export] wrote {fp32_path} ({fp32_path.stat().st_size / 1e6:.0f} MB, {kind} exporter)")

    # Parity on two shapes (4 x longest pair, 1 x shortest pair) so dynamic batch/sequence axes are exercised.
    short = min(SAMPLE_PAIRS, key=lambda qp: len(qp[0]) + len(qp[1]))
    enc1 = tokenizer([short[0]], [short[1]], truncation=True, max_length=512, return_tensors="pt")
    checks = []
    for e in (enc, enc1):
        with torch.no_grad():
            ref_e = model(**{n: e[n] for n in input_names}).logits.numpy()
        checks.append(({n: e[n].numpy().astype(np.int64) for n in input_names}, ref_e))
    feeds, ref = checks[0]
    diff32 = max(float(np.abs(onnx_logits(fp32_path, f) - r).max()) for f, r in checks)
    print(f"[export] fp32 parity: max |logit diff| = {diff32:.2e}")
    if diff32 > 1e-3:
        print("[export] warning: fp32 ONNX logits differ from PyTorch by more than 1e-3")

    info = {
        "source": args.model,
        "architecture": model.config.architectures,
        "model_type": model.config.model_type,
        "num_labels": model.config.num_labels,
        "inputs": input_names,
        "output": "logits",
        "opset": args.opset if kind == "torchscript" else max(args.opset, 18),
        "exporter": kind,
        "torch": torch.__version__,
        "files": {"fp32": "onnx/model.onnx"},
        "parity_max_abs_logit_diff": {"fp32": diff32},
        "sample_logits_pytorch": ref.reshape(-1).round(4).tolist(),
    }

    if not args.no_quantize:
        from onnxruntime.quantization import QuantType, quantize_dynamic

        q_path = out / "onnx" / "model_quantized.onnx"
        q_src = fp32_path
        if kind == "dynamo":
            # The dynamo exporter writes value_info shapes that trip quantize_dynamic's shape inference
            # ("Inferred shape and existing shape differ"); quantize a copy without them.
            import onnx

            g = onnx.load(str(fp32_path))
            del g.graph.value_info[:]
            q_src = out / "onnx" / "_model_for_quant.onnx"
            onnx.save(g, str(q_src))
        quantize_dynamic(
            model_input=str(q_src),
            model_output=str(q_path),
            weight_type=QuantType.QInt8 if args.quant_type == "qint8" else QuantType.QUInt8,
            per_channel=args.per_channel,
            reduce_range=False,
        )
        if q_src != fp32_path:
            q_src.unlink()
        q_logits = onnx_logits(q_path, feeds)
        diffq = max(float(np.abs(onnx_logits(q_path, f) - r).max()) for f, r in checks)
        same_order = bool(np.array_equal(np.argsort(-ref[:, 0]), np.argsort(-q_logits[:, 0])))
        print(f"[export] wrote {q_path} ({q_path.stat().st_size / 1e6:.0f} MB); max |logit diff| vs PyTorch = {diffq:.3f}, same ranking: {same_order}")
        info["files"]["q8"] = "onnx/model_quantized.onnx"
        info["quantization"] = {"method": "onnxruntime.quantize_dynamic", "weight_type": args.quant_type, "per_channel": args.per_channel, "reduce_range": False}
        info["parity_max_abs_logit_diff"]["q8"] = diffq
        info["sample_ranking_preserved_q8"] = same_order

    (out / "export_info.json").write_text(json.dumps(info, indent=2) + "\n", encoding="utf-8")
    print(f"[export] done: {out}")
    for p in sorted(out.rglob("*")):
        if p.is_file():
            print(f"  {p.relative_to(out)}  {p.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
