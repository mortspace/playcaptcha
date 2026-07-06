/*
 * Client proof-of-work solver. The challenge is: find a `solution` string so
 * that SHA-256(seed || ':' || solution) starts with `bits` zero bits.
 *
 * Runs in the browser via Web Crypto (crypto.subtle). The solver yields back to
 * the event loop every few hundred iterations so the claw-machine rAF loop
 * keeps animating smoothly — the user shouldn't notice the work happening.
 *
 * ~14 bits ≈ a few hundred-thousand iterations ≈ well under a second on a
 * laptop. That's free for one real user and meaningfully costly for a bot farm
 * hammering a target endpoint. It is NOT a hard barrier — a determined attacker
 * with WASM or a GPU can crack it — it raises the cost, same role as PoW in any
 * anti-abuse system.
 */

import type { PowSolution, PowSpec } from './types.ts'

const enc = new TextEncoder()

/** Count leading zero bits in a 32-byte SHA-256 digest. */
function leadingZeros(bytes: Uint8Array): number {
  let bits = 0
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b === 0) {
      bits += 8
      continue
    }
    // count leading zeros in this byte
    let m = 0x80
    while ((b & m) === 0) {
      bits++
      m >>= 1
    }
    break
  }
  return bits
}

/** Hash seed:solution and return leading-zero-bit count. Shared with the
 *  server (see server/index.ts solveHash) — keep them byte-for-byte identical. */
async function zeroBits(spec: PowSpec, solution: string): Promise<number> {
  const data = enc.encode(`${spec.seed}:${solution}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return leadingZeros(new Uint8Array(digest))
}

export interface SolveOptions {
  /** Yield to the UI loop every this many iterations (default 400). */
  yieldEvery?: number
  /** Hard cap so a runaway solve can't pin a tab forever (default 5_000_000). */
  maxAttempts?: number
  /** Optional progress callback in [0,1) — purely for UI/telemetry. */
  onProgress?: (p: number) => void
  /** AbortSignal to cancel an in-flight solve. */
  signal?: AbortSignal
}

/** Solve a PoW spec, returning the solution + iteration count. Rejects on
 *  abort or if maxAttempts is exceeded. The caller decides how to handle a
 *  rejection — the component shows a "Verification took too long" message. */
export async function solvePow(spec: PowSpec, opts: SolveOptions = {}): Promise<PowSolution> {
  const { yieldEvery = 400, maxAttempts = 5_000_000, onProgress, signal } = opts
  if (spec.bits < 1) return { solution: '', attempts: 0 }

  // incremental solution space: base-36 counter strings. A real distribution,
  // not "0", "1", ... — start at a random offset so two solvers on the same
  // seed explore different regions (matters less here than for hashcash, but
  // keeps the search feeling honest).
  let n = Math.floor(Math.random() * 1e6)
  let attempts = 0

  // batch: check `batchSize` candidates per await, then yield.
  // awaiting digest() once per candidate is slow; we interleave so each batch
  // still releases the thread.
  while (attempts < maxAttempts) {
    if (signal?.aborted) throw new DOMException('PoW aborted', 'AbortError')

    const solution = n.toString(36)
    const z = await zeroBits(spec, solution)
    if (z >= spec.bits) {
      return { solution, attempts: attempts + 1 }
    }
    n++
    attempts++

    if (attempts % yieldEvery === 0) {
      onProgress?.(Math.min(0.99, attempts / maxAttempts))
      // setTimeout(0) is enough to let the rAF loop tick; we don't need a real
      // macrotask boundary, just a chance for the animation frame to run.
      await new Promise<void>((r) => setTimeout(r, 0))
    }
  }

  throw new Error('PoW exceeded max attempts')
}

/** Quick validity check a client can run on its own solution before posting
 *  (cheap sanity; the server re-checks authoritatively). */
export async function isValidPow(spec: PowSpec, solution: string): Promise<boolean> {
  if (spec.bits < 1) return true
  return (await zeroBits(spec, solution)) >= spec.bits
}
