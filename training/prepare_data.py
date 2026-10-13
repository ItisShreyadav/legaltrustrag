#!/usr/bin/env python3
"""Build cross-encoder training data for the LegalTrustRAG legal reranker from LegalBench-RAG.

Pipeline
  1. Download LegalBench-RAG (corpus + benchmarks, ~90 MB zip from the authors' Dropbox) into
     training/data/raw/ unless it is already there (or point --source at an extracted copy).
  2. Select queries: by default the LegalBench-RAG-mini selection (194 queries per sub-benchmark,
     chosen exactly as legalbenchrag/benchmark.py does); --full uses all ~6.9k queries.
  3. Chunk every corpus document into clause-like spans, roughly mirroring the TypeScript section
     parser (src/lib/parse/structure.ts): new chunk on blank lines and numbered / lettered headings,
     header-only lines folded into the following chunk, long blocks split at sentence ends, chunks kept
     within 100-1500 characters.
  4. Split queries 90/10 by document (stratified per sub-benchmark) so no validation document is
     ever seen in training. --val-mini (with --full) instead holds out exactly the mini queries.
  5. For each query: positives = chunks overlapping a gold span; 4 hard negatives = best BM25 chunks
     of the same document that do not overlap any gold span; 2 random negatives from other documents
     of the same split. Deduplicated by normalised text.
  6. Validation queries also get a BM25 candidate list (top --candidates chunks of the gold document,
     or of the pooled validation corpus with --candidate-scope corpus) for P@1 / R@10 / MRR@10.

Outputs (default training/data/<mini|full|full-valmini>/):
  train.jsonl   one record per query: query, positives, hard_negatives, random_negatives, spans
  val.jsonl     same, plus "candidates" (BM25-ranked, with relevance labels) and "num_relevant"
  stats.json    dataset sizes and chunking statistics

Usage
  python training/prepare_data.py                    # mini benchmark
  python training/prepare_data.py --full             # full benchmark
  python training/prepare_data.py --full --val-mini  # train on full minus mini docs, validate on mini
"""

from __future__ import annotations

import argparse
import json
import random
import re
import shutil
import statistics
import sys
import time
import urllib.request
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

try:
    from rank_bm25 import BM25Okapi
except ImportError:  # pragma: no cover - environment problem, not a code path
    sys.exit("rank_bm25 is missing: pip install -r training/requirements.txt")

HERE = Path(__file__).resolve().parent
DEFAULT_DATA_DIR = HERE / "data"
DATA_URL = (
    "https://www.dropbox.com/scl/fo/r7xfa5i3hdsbxex1w6amw/AID389Olvtm-ZLTKAPrw6k4"
    "?rlkey=5n8zrbk4c08lbit3iiexofmwg&st=0hu354cq&dl=1"
)
BENCHMARKS = ("privacy_qa", "contractnli", "maud", "cuad")
# legalbenchrag/benchmark.py: MAX_TESTS_PER_BENCHMARK with SORT_BY_DOCUMENT = True.
MINI_TESTS_PER_BENCHMARK = 194

MIN_CHUNK_CHARS = 100
MAX_CHUNK_CHARS = 1500
MIN_SPLIT_CHARS = 200  # never cut a long block into a piece shorter than this (same as the TS parser)
MIN_POSITIVE_OVERLAP = 40  # chars of gold span a chunk must contain to count as a positive


# ----------------------------------------------------------------------------------------------
# Download / load
# ----------------------------------------------------------------------------------------------


def _find_dataset_root(base: Path) -> Path | None:
    """Return the directory that contains corpus/ and benchmarks/ (the zip may nest them)."""
    for cand in [base, *sorted(p for p in base.rglob("*") if p.is_dir())]:
        if (cand / "corpus").is_dir() and (cand / "benchmarks").is_dir():
            return cand
    return None


def _safe_extract(zip_path: Path, dest: Path) -> None:
    """Extract member by member, refusing absolute paths and '..' (the archive contains a '/' entry)."""
    dest = dest.resolve()
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            name = info.filename.replace("\\", "/")
            parts = [p for p in name.split("/") if p not in ("", ".")]
            if not parts or name.startswith("/") or ".." in parts or info.is_dir():
                continue
            target = dest.joinpath(*parts).resolve()
            if dest not in target.parents:
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, open(target, "wb") as out:
                shutil.copyfileobj(src, out)


def _download(url: str, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".part")
    print(f"[data] downloading LegalBench-RAG (~90 MB) -> {path}")
    req = urllib.request.Request(url, headers={"User-Agent": "legaltrustrag-training/1.0"})
    with urllib.request.urlopen(req, timeout=120) as resp, open(tmp, "wb") as out:
        total = int(resp.headers.get("Content-Length") or 0)
        done = 0
        last = time.time()
        while True:
            buf = resp.read(1 << 20)
            if not buf:
                break
            out.write(buf)
            done += len(buf)
            if time.time() - last > 5:
                pct = f" ({100 * done / total:.0f}%)" if total else ""
                print(f"[data]   {done / 1e6:.0f} MB{pct}")
                last = time.time()
    tmp.replace(path)


def ensure_dataset(raw_dir: Path, url: str, source: Path | None) -> Path:
    if source is not None:
        root = _find_dataset_root(source)
        if root is None:
            sys.exit(f"--source {source}: no corpus/ and benchmarks/ folders found")
        return root
    root = _find_dataset_root(raw_dir) if raw_dir.exists() else None
    if root is not None:
        return root
    zip_path = raw_dir / "LegalBench-RAG.zip"
    if not zip_path.exists():
        _download(url, zip_path)
    print(f"[data] extracting {zip_path.name}")
    _safe_extract(zip_path, raw_dir)
    root = _find_dataset_root(raw_dir)
    if root is None:
        sys.exit(f"{zip_path}: archive does not contain corpus/ and benchmarks/")
    return root


@dataclass
class Test:
    qid: str
    benchmark: str
    query: str
    spans: list[tuple[str, int, int]]  # (file_path, start, end)

    @property
    def doc(self) -> str:
        return self.spans[0][0]


def _mini_key(test: dict) -> float:
    # benchmark.py: random.seed(test.snippets[0].file_path); random.random()  (seed version 2 = sha512)
    return random.Random(test["snippets"][0]["file_path"]).random()


def load_tests(root: Path, full: bool, benchmarks: list[str]) -> tuple[list[Test], set[str]]:
    """Return the selected tests plus the qids of the mini selection (for --val-mini)."""
    tests: list[Test] = []
    mini_qids: set[str] = set()
    for name in benchmarks:
        raw = json.loads((root / "benchmarks" / f"{name}.json").read_text(encoding="utf-8"))["tests"]
        indexed = [(i, t) for i, t in enumerate(raw) if t.get("snippets")]
        mini = indexed
        if len(indexed) > MINI_TESTS_PER_BENCHMARK:
            mini = sorted(indexed, key=lambda it: _mini_key(it[1]))[:MINI_TESTS_PER_BENCHMARK]
        mini_qids |= {f"{name}-{i}" for i, _ in mini}
        for i, t in indexed if full else mini:
            spans = [(s["file_path"], int(s["span"][0]), int(s["span"][1])) for s in t["snippets"]]
            tests.append(Test(qid=f"{name}-{i}", benchmark=name, query=t["query"].strip(), spans=spans))
    return tests, mini_qids


def read_doc(root: Path, file_path: str) -> str:
    # Same as legalbenchrag's Snippet.answer: text mode with universal newlines, so spans line up.
    with open(root / "corpus" / file_path, encoding="utf-8", errors="replace") as f:
        return f.read()


# ----------------------------------------------------------------------------------------------
# Chunking (rough Python mirror of src/lib/parse/structure.ts)
# ----------------------------------------------------------------------------------------------

_MARKER_RE = re.compile(
    r"""^(?:
        (?:ARTICLE|Article)\s+(?:[IVXLCDM]{1,6}|\d{1,3}|[A-Z])(?![A-Za-z0-9])
      | (?:SECTION|Section|Sec\.|§)\s*\d{1,3}(?:\.\d{1,3}){0,4}
      | \d{1,3}(?:\.\d{1,3}){1,4}\.?(?=\s|$)
      | \d{1,3}[.)](?=\s+["“(\[A-Z]|\s*$)
      | \((?:[a-z]{1,4}|[A-Z]{1,4}|\d{1,2})\)(?=\s)
      | (?:[a-z]|[ivx]{2,5}|[A-Z])[.)]\s+(?=["“(A-Z])
      | (?:EXHIBIT|SCHEDULE|ANNEX|APPENDIX|ATTACHMENT|Exhibit|Schedule|Annex|Appendix|Attachment)\s+[A-Z0-9]{1,4}(?![A-Za-z])
      | WHEREAS\b | NOW,?\s+THEREFORE\b | IN\s+WITNESS\s+WHEREOF\b
      | ["“][^"“”\n]{1,80}["”]\s*(?:\([^()\n]{0,80}\)\s*)?,?\s*
        (?:shall\s+mean|means|mean|shall\s+have\s+the\s+meaning|has\s+the\s+meaning|refers\s+to)\b
    )""",
    re.X,
)
_BOUNDARY_END_RE = re.compile(r"""(?:[.;:!?]["'”’)\]]*|[;,]\s*(?:and|or))$""", re.I)
_SENT_END_RE = re.compile(r"""[.;:!?]["'”’)\]]*(?=\s+["'“‘(\[A-Z0-9])|\n[ \t]*\n""")
_ABBREV = {
    "Inc", "Ltd", "Co", "Corp", "No", "Nos", "Sec", "Secs", "Art", "Mr", "Mrs", "Ms", "Dr", "St", "Jr",
    "Sr", "Fig", "Vol", "Para", "Cl", "Sch", "Exh", "LLC", "L.L.C", "N.A", "S.A", "U.S", "U.K", "Rev",
}


def _is_all_caps(s: str) -> bool:
    return sum(c.isupper() for c in s) >= 3 and not any(c.islower() for c in s)


def _is_heading_line(s: str) -> bool:
    return _is_all_caps(s) and len(s) <= 100 and len(s.split()) <= 12 and not s.endswith((",", ";"))


def _blocks(text: str) -> list[tuple[int, int]]:
    """Paragraph / heading blocks as trimmed (start, end) spans.

    A new block starts after a blank line, or at a marker line (numbered / lettered heading, ARTICLE,
    Section, Exhibit, WHEREAS, definition, ALL-CAPS heading) when the previous line ended at a sentence
    boundary or was itself a heading. Like the TS parser, an ALL-CAPS line only counts as a heading when
    it is not followed directly by another ALL-CAPS line (so shouted paragraphs stay together).
    """
    lines: list[tuple[int, int, str] | None] = []
    pos = 0
    for raw in text.split("\n"):
        stripped = raw.strip()
        if stripped:
            c_start = pos + (len(raw) - len(raw.lstrip()))
            lines.append((c_start, c_start + len(stripped), stripped))
        else:
            lines.append(None)
        pos += len(raw) + 1

    blocks: list[list[int]] = []
    prev: str | None = None
    prev_heading = False
    blank_before = True
    for idx, ln in enumerate(lines):
        if ln is None:
            blank_before = True
            continue
        c_start, c_end, s = ln
        nxt = lines[idx + 1] if idx + 1 < len(lines) else None
        heading = _is_heading_line(s) and (nxt is None or not _is_all_caps(nxt[2]))
        at_boundary = prev is None or prev_heading or bool(_BOUNDARY_END_RE.search(prev))
        is_marker = heading or bool(_MARKER_RE.match(s))
        if not blocks or blank_before or (is_marker and at_boundary):
            blocks.append([c_start, c_end])
        else:
            blocks[-1][1] = c_end
        prev, prev_heading, blank_before = s, heading, False
    return [(s, e) for s, e in blocks]


def _sentence_ends(local: str) -> list[int]:
    ends: list[int] = []
    for m in _SENT_END_RE.finditer(local):
        idx = m.start()
        if m.group(0).startswith("\n"):
            ends.append(idx)
            continue
        if m.group(0)[0] == ".":
            before = local[max(0, idx - 12) : idx]
            tok_m = re.search(r"([A-Za-z.]+)$", before)
            tok = tok_m.group(1) if tok_m else ""
            if tok in _ABBREV or re.fullmatch(r"[A-Z]", tok) or re.search(r"\.[A-Za-z]$", tok):
                continue  # Inc. / J. / U.S.
        ends.append(m.end())
    return ends


def _split_long(text: str, start: int, end: int, max_chars: int) -> list[tuple[int, int]]:
    """Split [start, end) into pieces <= max_chars at sentence ends near evenly spaced targets."""
    if end - start <= max_chars:
        return [(start, end)]
    local = text[start:end]
    ends = _sentence_ends(local)
    out: list[tuple[int, int]] = []
    s = 0
    while len(local) - s > max_chars:
        remaining = len(local) - s
        pieces = -(-remaining // max_chars)
        target = s + remaining / pieces
        cands = [e for e in ends if s + MIN_SPLIT_CHARS < e <= s + max_chars]
        if cands:
            cut = min(cands, key=lambda e: abs(e - target))
        else:
            ws = local.rfind(" ", 0, s + max_chars)
            cut = ws if ws > s + MIN_SPLIT_CHARS else s + max_chars
        piece_end = s + len(local[s:cut].rstrip())
        if piece_end > s:
            out.append((start + s, start + piece_end))
        s = cut
        while s < len(local) and local[s].isspace():
            s += 1
    if s < len(local):
        out.append((start + s, start + s + len(local[s:].rstrip())))
    return out


def chunk_document(text: str, min_chars: int = MIN_CHUNK_CHARS, max_chars: int = MAX_CHUNK_CHARS) -> list[tuple[int, int]]:
    pieces: list[tuple[int, int]] = []
    for s, e in _blocks(text):
        pieces.extend(_split_long(text, s, e, max_chars))
    # Short pieces (headings, one-line list items) are folded into the following piece, like the TS
    # parser folds header-only blocks into their first child; if that would exceed max_chars they join
    # the previous piece instead. Leftover fragments with almost no text (page numbers, "______") are
    # dropped: they can never hold a gold span and only make trivially easy negatives.
    merged: list[tuple[int, int]] = []
    carry: tuple[int, int] | None = None

    def flush(cs: int, ce: int, next_end: int | None) -> int | None:
        """Place a pending short piece; returns the new start for the next piece if merged forward."""
        if next_end is not None and next_end - cs <= max_chars:
            return cs
        if merged and ce - merged[-1][0] <= max_chars:
            merged[-1] = (merged[-1][0], ce)
        else:
            merged.append((cs, ce))
        return None

    for s, e in pieces:
        if carry is not None:
            new_start = flush(carry[0], carry[1], e)
            carry = None
            if new_start is not None:
                s = new_start
        if e - s < min_chars:
            carry = (s, e)
        else:
            merged.append((s, e))
    if carry is not None:
        flush(carry[0], carry[1], None)

    def substantive(s: int, e: int) -> bool:
        return e - s >= min_chars or sum(c.isalnum() for c in text[s:e]) >= 20

    return [(s, e) for s, e in merged if text[s:e].strip() and substantive(s, e)]


# ----------------------------------------------------------------------------------------------
# BM25
# ----------------------------------------------------------------------------------------------

_STOP = set(
    """a an the of to in on at by for with from as is are was were be been being am this that these those
    it its itself and or such which who whom whose what their theirs there they them he she his her hers
    him we our ours us you your yours i me my into onto upon than then so do does did doing has have had
    having also very can could would should here herein hereof hereto hereby hereunder therein thereof
    thereto thereby thereunder said same about between both each either own per via etc""".split()
)
_TOKEN_RE = re.compile(r"[a-z0-9]+")


def bm25_tokens(text: str) -> list[str]:
    toks = [t for t in _TOKEN_RE.findall(text.lower()) if t not in _STOP]
    return toks or ["_empty_"]


def norm_text(text: str) -> str:
    return " ".join(text.split()).lower()


@dataclass
class Doc:
    path: str
    text: str
    chunks: list[tuple[int, int]]
    _bm25: BM25Okapi | None = field(default=None, repr=False)

    def chunk_text(self, i: int) -> str:
        s, e = self.chunks[i]
        return self.text[s:e]

    @property
    def bm25(self) -> BM25Okapi:
        if self._bm25 is None:
            self._bm25 = BM25Okapi([bm25_tokens(self.chunk_text(i)) for i in range(len(self.chunks))])
        return self._bm25


def overlap(a0: int, a1: int, b0: int, b1: int) -> int:
    return max(0, min(a1, b1) - max(a0, b0))


def label_chunks(test: Test, doc: Doc) -> tuple[list[int], set[int]]:
    """(positive chunk indices sorted by overlap desc, indices touching any gold span)."""
    touched: set[int] = set()
    scored: list[tuple[float, int]] = []
    gold = [(s, e) for p, s, e in test.spans if p == doc.path]
    for i, (cs, ce) in enumerate(doc.chunks):
        best = 0.0
        for gs, ge in gold:
            ov = overlap(cs, ce, gs, ge)
            if ov <= 0:
                continue
            touched.add(i)
            need = min(MIN_POSITIVE_OVERLAP, max(1, ge - gs) * 0.5)
            if ov >= need:
                best = max(best, ov / min(ce - cs, ge - gs))
        if best > 0:
            scored.append((best, i))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [i for _, i in scored], touched


# ----------------------------------------------------------------------------------------------
# Split
# ----------------------------------------------------------------------------------------------


def split_by_document(tests: list[Test], val_frac: float, seed: int) -> tuple[list[Test], list[Test]]:
    """Hold out ~val_frac of each sub-benchmark's queries, whole documents at a time."""
    rng = random.Random(seed)
    val_docs: set[str] = set()
    by_bench: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for t in tests:
        by_bench[t.benchmark][t.doc] += 1
    for bench in sorted(by_bench):
        counts = by_bench[bench]
        docs = sorted(counts)
        if len(docs) < 2:
            continue
        rng.shuffle(docs)
        target = val_frac * sum(counts.values())
        got = 0
        for d in docs:
            if got == 0 or abs(got + counts[d] - target) < abs(got - target):
                val_docs.add(d)
                got += counts[d]
            if got >= target:
                break
    train = [t for t in tests if t.doc not in val_docs]
    val = [t for t in tests if t.doc in val_docs]
    return train, val


# ----------------------------------------------------------------------------------------------
# Records
# ----------------------------------------------------------------------------------------------


def build_records(
    tests: list[Test],
    docs: dict[str, Doc],
    *,
    rng: random.Random,
    hard_k: int,
    random_k: int,
    max_pos: int,
    candidates_k: int,
    candidate_scope: str | None,
    stats: dict,
) -> list[dict]:
    split_docs = sorted({p for t in tests for p, _, _ in t.spans if p in docs})
    pooled: list[tuple[str, int]] = []
    pooled_bm25: BM25Okapi | None = None
    if candidate_scope == "corpus":
        pooled = [(p, i) for p in split_docs for i in range(len(docs[p].chunks))]
        print(f"[data] indexing {len(pooled)} chunks for corpus-scope candidates")
        pooled_bm25 = BM25Okapi([bm25_tokens(docs[p].chunk_text(i)) for p, i in pooled])

    records: list[dict] = []
    seen: set[tuple[str, tuple[str, ...]]] = set()
    for t in tests:
        doc = docs.get(t.doc)
        if doc is None or not doc.chunks:
            stats["skipped_missing_doc"] += 1
            continue
        pos_idx, touched = label_chunks(t, doc)
        # Gold spans in other files (rare) still count as positives.
        extra_pos: list[str] = []
        for p in sorted({p for p, _, _ in t.spans} - {doc.path}):
            if p in docs:
                ep, _ = label_chunks(t, docs[p])
                extra_pos += [docs[p].chunk_text(i) for i in ep]
        if not pos_idx and not extra_pos:
            stats["skipped_no_positive"] += 1
            continue
        positives: list[str] = []
        pos_norm: set[str] = set()
        for txt in [doc.chunk_text(i) for i in pos_idx] + extra_pos:
            n = norm_text(txt)
            if n not in pos_norm:
                pos_norm.add(n)
                positives.append(txt)
        key = (norm_text(t.query), tuple(sorted(pos_norm)))
        if key in seen:
            stats["skipped_duplicate"] += 1
            continue
        seen.add(key)

        q_tokens = bm25_tokens(t.query)
        scores = doc.bm25.get_scores(q_tokens)
        order = sorted(range(len(doc.chunks)), key=lambda i: (-scores[i], i))

        used = set(pos_norm)
        hard: list[str] = []
        hard_spans: list[list[int]] = []
        for i in order:
            if len(hard) >= hard_k or scores[i] <= 0:
                break
            if i in touched:
                continue
            n = norm_text(doc.chunk_text(i))
            if n in used:
                continue
            used.add(n)
            hard.append(doc.chunk_text(i))
            hard_spans.append(list(doc.chunks[i]))

        rand: list[str] = []
        others = [p for p in split_docs if p != doc.path and p not in {s[0] for s in t.spans}]
        for _ in range(random_k * 5):
            if len(rand) >= random_k or not others:
                break
            od = docs[rng.choice(others)]
            if not od.chunks:
                continue
            txt = od.chunk_text(rng.randrange(len(od.chunks)))
            n = norm_text(txt)
            if n in used:
                continue
            used.add(n)
            rand.append(txt)

        rec = {
            "qid": t.qid,
            "benchmark": t.benchmark,
            "doc": t.doc,
            "query": t.query,
            "positives": positives[:max_pos],
            "hard_negatives": hard,
            "random_negatives": rand,
            "gold_spans": [[p, s, e] for p, s, e in t.spans],
            "positive_spans": [list(doc.chunks[i]) for i in pos_idx[:max_pos]],
            "hard_negative_spans": hard_spans,
        }

        if candidate_scope is not None:
            rec.update(
                _candidates(t, doc, pos_idx, touched, scores, order, candidates_k, candidate_scope, docs, pooled, pooled_bm25, q_tokens)
            )
        records.append(rec)
        stats["positives"] += len(rec["positives"])
        stats["hard_negatives"] += len(hard)
        stats["random_negatives"] += len(rand)
    return records


def _candidates(t, doc, pos_idx, touched, scores, order, k, scope, docs, pooled, pooled_bm25, q_tokens) -> dict:
    """BM25 top-k candidates with relevance labels. Chunks that only graze a gold span are dropped."""
    positive = set(pos_idx)
    if scope == "doc":
        ranked = [(doc.path, i, float(scores[i])) for i in order]
        relevant_total = len(positive)
    else:
        ps = pooled_bm25.get_scores(q_tokens)
        top = sorted(range(len(pooled)), key=lambda j: (-ps[j], j))
        ranked = [(pooled[j][0], pooled[j][1], float(ps[j])) for j in top]
        relevant_total = len(positive)
    cands: list[dict] = []
    seen_text: set[str] = set()
    for path, i, sc in ranked:
        if len(cands) >= k:
            break
        same_doc = path == doc.path
        if same_doc and i in touched and i not in positive:
            continue
        txt = docs[path].chunk_text(i)
        n = norm_text(txt)
        if n in seen_text:
            continue
        seen_text.add(n)
        cands.append(
            {"text": txt, "relevant": bool(same_doc and i in positive), "bm25": round(sc, 4), "doc": path, "span": list(docs[path].chunks[i])}
        )
    return {"candidates": cands, "num_relevant": relevant_total}


# ----------------------------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------------------------


def write_jsonl(path: Path, rows: list[dict]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--full", action="store_true", help="use the full benchmark instead of LegalBench-RAG-mini")
    ap.add_argument("--val-mini", action="store_true", help="with --full: validate on exactly the mini queries, train on documents outside mini")
    ap.add_argument("--benchmarks", nargs="+", default=list(BENCHMARKS), choices=BENCHMARKS)
    ap.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR, help="root for raw download and outputs (default training/data)")
    ap.add_argument("--out", type=Path, default=None, help="output folder (default <data-dir>/<mini|full|full-valmini>)")
    ap.add_argument("--source", type=Path, default=None, help="use an already extracted LegalBench-RAG folder (corpus/ + benchmarks/)")
    ap.add_argument("--url", default=DATA_URL, help="dataset zip URL")
    ap.add_argument("--val-frac", type=float, default=0.10)
    ap.add_argument("--hard-negatives", type=int, default=4)
    ap.add_argument("--random-negatives", type=int, default=2)
    ap.add_argument("--max-positives", type=int, default=3)
    ap.add_argument("--candidates", type=int, default=50, help="BM25 candidates per validation query")
    ap.add_argument("--candidate-scope", choices=["doc", "corpus"], default="doc",
                    help="doc: rank chunks of the gold document (how LegalTrustRAG searches an uploaded contract); "
                         "corpus: rank all validation-document chunks pooled (LegalBench-RAG style)")
    ap.add_argument("--min-chars", type=int, default=MIN_CHUNK_CHARS)
    ap.add_argument("--max-chars", type=int, default=MAX_CHUNK_CHARS)
    ap.add_argument("--max-queries", type=int, default=0, help="cap on selected queries (0 = no cap), for quick runs")
    ap.add_argument("--seed", type=int, default=13)
    args = ap.parse_args()

    if args.val_mini and not args.full:
        ap.error("--val-mini requires --full")
    name = "full-valmini" if args.val_mini else ("full" if args.full else "mini")
    out_dir = args.out or (args.data_dir / name)
    out_dir.mkdir(parents=True, exist_ok=True)

    root = ensure_dataset(args.data_dir / "raw", args.url, args.source)
    print(f"[data] dataset root: {root}")
    tests, mini_qids = load_tests(root, args.full, args.benchmarks)
    if args.max_queries and len(tests) > args.max_queries:
        tests = random.Random(args.seed).sample(tests, args.max_queries)
    print(f"[data] {len(tests)} queries selected ({name})")

    paths = sorted({p for t in tests for p, _, _ in t.spans})
    docs: dict[str, Doc] = {}
    missing = 0
    for p in paths:
        try:
            text = read_doc(root, p)
        except FileNotFoundError:
            missing += 1
            continue
        docs[p] = Doc(path=p, text=text, chunks=chunk_document(text, args.min_chars, args.max_chars))
    lens = [e - s for d in docs.values() for s, e in d.chunks]
    print(f"[data] {len(docs)} documents -> {len(lens)} chunks (missing files: {missing})")

    if args.val_mini:
        val_tests = [t for t in tests if t.qid in mini_qids]
        mini_docs = {t.doc for t in val_tests}
        train_tests = [t for t in tests if t.qid not in mini_qids and t.doc not in mini_docs]
    else:
        train_tests, val_tests = split_by_document(tests, args.val_frac, args.seed)
    if not val_tests:
        print("[data] warning: empty validation split (too few documents?)")

    stats_tr: dict = defaultdict(int)
    stats_va: dict = defaultdict(int)
    rng = random.Random(args.seed)
    common = dict(rng=rng, hard_k=args.hard_negatives, random_k=args.random_negatives, max_pos=args.max_positives, candidates_k=args.candidates)
    train = build_records(train_tests, docs, candidate_scope=None, stats=stats_tr, **common)
    val = build_records(val_tests, docs, candidate_scope=args.candidate_scope, stats=stats_va, **common)

    write_jsonl(out_dir / "train.jsonl", train)
    write_jsonl(out_dir / "val.jsonl", val)

    def pairs(rows: list[dict]) -> int:
        return sum(len(r["positives"]) + len(r["hard_negatives"]) + len(r["random_negatives"]) for r in rows)

    def cand_recall(rows: list[dict], k: int) -> float:
        """Macro-averaged recall of the BM25 top-k (same definition as eval_reranker.py's R@k)."""
        vals = [sum(c["relevant"] for c in r["candidates"][:k]) / max(r["num_relevant"], 1) for r in rows]
        return round(statistics.fmean(vals), 4) if vals else 0.0

    in_range = sum(args.min_chars <= n <= args.max_chars for n in lens)
    stats = {
        "variant": name,
        "benchmarks": args.benchmarks,
        "queries_selected": len(tests),
        "documents": len(docs),
        "chunks": len(lens),
        "chunk_chars": {
            "min": min(lens) if lens else 0,
            "median": int(statistics.median(lens)) if lens else 0,
            "mean": round(statistics.fmean(lens), 1) if lens else 0,
            "max": max(lens) if lens else 0,
            f"share_in_{args.min_chars}_{args.max_chars}": round(in_range / len(lens), 4) if lens else 0,
        },
        "train": {
            "queries": len(train),
            "documents": len({r["doc"] for r in train}),
            "pairs": pairs(train),
            "per_benchmark": {b: sum(r["benchmark"] == b for r in train) for b in args.benchmarks},
            **{k: v for k, v in stats_tr.items()},
        },
        "val": {
            "queries": len(val),
            "documents": len({r["doc"] for r in val}),
            "pairs": pairs(val),
            "per_benchmark": {b: sum(r["benchmark"] == b for r in val) for b in args.benchmarks},
            "candidate_scope": args.candidate_scope,
            "candidates_per_query": args.candidates,
            "bm25_recall@10": cand_recall(val, 10),
            f"bm25_recall@{args.candidates}": cand_recall(val, args.candidates),
            **{k: v for k, v in stats_va.items()},
        },
        "seed": args.seed,
    }
    (out_dir / "stats.json").write_text(json.dumps(stats, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(stats, indent=2))
    print(f"[data] wrote {out_dir / 'train.jsonl'} and {out_dir / 'val.jsonl'}")


if __name__ == "__main__":
    main()
