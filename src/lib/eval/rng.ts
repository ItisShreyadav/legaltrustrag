/**
 * Deterministic randomness for the evaluation tooling.
 *
 * - `Rng`: small seeded PRNG (xmur3 string hash -> sfc32) for dataset construction and sampling.
 * - `PyRandom`: a bit-exact port of CPython's `random.seed(str)` + `random.random()` (MT19937,
 *   seed version 2), used to reproduce LegalBench-RAG-mini's test selection, which sorts tests by
 *   `random.seed(file_path); random.random()`.
 */
import { createHash } from "node:crypto";

/** xmur3: string -> stream of 32-bit seeds. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string | number) {
    const next = xmur3(String(seed));
    this.a = next();
    this.b = next();
    this.c = next();
    this.d = next();
    for (let i = 0; i < 12; i++) this.next();
  }

  /** Uniform float in [0, 1). sfc32. */
  next(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick on an empty list");
    return items[this.int(items.length)];
  }

  /** Fisher-Yates; returns a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** `n` distinct items (or all of them if fewer), in random order. */
  sample<T>(items: readonly T[], n: number): T[] {
    return this.shuffle(items).slice(0, Math.max(0, n));
  }
}

/** Stable 32-bit FNV-1a hash, for deterministic per-item decisions (stubs, tie-breaks). */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// CPython random (MT19937), bit-exact for seed(str) + random()
// ---------------------------------------------------------------------------

const N = 624;
const M = 397;

export class PyRandom {
  private readonly mt = new Uint32Array(N);
  private mti = N + 1;

  constructor(seed: string) {
    this.seed(seed);
  }

  /** `random.seed(s)` for a str `s` (version 2: int.from_bytes(s.encode() + sha512(s.encode()).digest(), "big")). */
  seed(seed: string): void {
    const raw = Buffer.from(seed, "utf8");
    const bytes = Buffer.concat([raw, createHash("sha512").update(raw).digest()]);
    // CPython feeds abs(n) to init_by_array as 32-bit words, least significant word first.
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    const significant = bytes.subarray(start);
    const words = Math.max(1, Math.ceil(significant.length / 4));
    const key = new Uint32Array(words);
    for (let w = 0; w < words; w++) {
      const end = significant.length - 4 * w;
      let v = 0;
      for (let k = Math.max(0, end - 4); k < end; k++) v = ((v << 8) | significant[k]) >>> 0;
      key[w] = v;
    }
    this.initByArray(key);
  }

  private initGenrand(s: number): void {
    const mt = this.mt;
    mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.mti = N;
  }

  private initByArray(key: Uint32Array): void {
    const mt = this.mt;
    this.initGenrand(19650218);
    let i = 1;
    let j = 0;
    for (let k = Math.max(N, key.length); k > 0; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1664525)) + key[j] + j) >>> 0;
      i++;
      j++;
      if (i >= N) {
        mt[0] = mt[N - 1];
        i = 1;
      }
      if (j >= key.length) j = 0;
    }
    for (let k = N - 1; k > 0; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) {
        mt[0] = mt[N - 1];
        i = 1;
      }
    }
    mt[0] = 0x80000000;
  }

  private genrandUint32(): number {
    const mt = this.mt;
    if (this.mti >= N) {
      let kk = 0;
      const mag = (y: number) => (y & 1 ? 0x9908b0df : 0);
      for (; kk < N - M; kk++) {
        const y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff);
        mt[kk] = (mt[kk + M] ^ (y >>> 1) ^ mag(y)) >>> 0;
      }
      for (; kk < N - 1; kk++) {
        const y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff);
        mt[kk] = (mt[kk + (M - N)] ^ (y >>> 1) ^ mag(y)) >>> 0;
      }
      const y = (mt[N - 1] & 0x80000000) | (mt[0] & 0x7fffffff);
      mt[N - 1] = (mt[M - 1] ^ (y >>> 1) ^ mag(y)) >>> 0;
      this.mti = 0;
    }
    let y = mt[this.mti++];
    y ^= y >>> 11;
    y = (y ^ ((y << 7) & 0x9d2c5680)) >>> 0;
    y = (y ^ ((y << 15) & 0xefc60000)) >>> 0;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** `random.random()`: 53-bit float in [0, 1). */
  random(): number {
    const a = this.genrandUint32() >>> 5;
    const b = this.genrandUint32() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }
}

/** Python: `random.seed(s); random.random()`. */
export function pyRandomForSeed(seed: string): number {
  return new PyRandom(seed).random();
}
