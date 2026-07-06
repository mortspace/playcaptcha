/*
 * Stateless human-verification server module.
 *
 *   createVerifier({ secret, ... }) → { issueChallenge, verifyAttempt, verifyToken }
 *
 * - issueChallenge(): mint an HMAC-signed Challenge the client round-trips back.
 *   Nothing is stored server-side by default (opt into ReplayStore for single-use).
 * - verifyAttempt(input): re-check the signature, expiry, PoW, and behavioral
 *   score; if it all passes, mint a server-signed token the consumer trusts.
 * - verifyToken(token): decode + check the token's signature and expiry on the
 *   consumer's protected endpoint. Stateless — no DB lookup needed.
 *
 * Uses only Node's built-in `crypto`. Framework-agnostic: hand the methods to
 * whatever request handler you use (see handlers.ts for a Fetch-shaped shim),
 * or call them directly from a worker / cron.
 *
 * The client cannot prove the grab happened — it reports its own signals and
 * its own PoW solution. The real defenses here are: (1) the unforgeable HMAC
 * signature (an attacker can't mint a valid token without the server secret),
 * (2) the real CPU cost of the PoW at scale, and (3) the heuristic score that
 * catches naive bot scripts. This is the same shape as reCAPTCHA / hCaptcha.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type {
  AttemptInput,
  Challenge,
  ClientSignals,
  PowSpec,
  TokenPayload,
  VerifyResult,
} from '../verify/types.ts'
import { TOY_META, type ToyId } from '../toys.ts'
import { scoreSignals } from '../verify/signals.ts'
import type { ReplayStore } from './store.ts'

export interface VerifierOptions {
  /** HMAC secret. KEEP THIS SERVER-SIDE. Used to sign challenges and tokens. */
  secret: string
  /** PoW difficulty in leading-zero bits. Default 14 (≈ a few hundred-k iters). */
  powBits?: number
  /** How long a challenge is good for, in ms. Default 5 min. */
  challengeTtlMs?: number
  /** How long a verified token is good for, in ms. Default 10 min. */
  tokenTtlMs?: number
  /** Minimum humanness score to issue a token. Default 0.5. */
  minScore?: number
  /** Namespaces tokens so you can run multiple verifiers with different secrets. */
  audience?: string
  /** Opt-in single-use protection. See store.ts. */
  replayStore?: ReplayStore
  /** Override the toy pool (default: all 12). Useful for tests. */
  toys?: ToyId[]
  /** Override the random source (default: crypto.randomBytes). For tests. */
  rng?: (n: number) => Buffer
}

export interface Verifier {
  issueChallenge(target?: ToyId): Promise<Challenge> | Challenge
  verifyAttempt(input: AttemptInput): Promise<VerifyResult> | VerifyResult
  verifyToken(token: string): { ok: true; payload: TokenPayload } | { ok: false; reason: string }
}

const DEFAULT_TOYS = Object.keys(TOY_META) as ToyId[]

export function createVerifier(opts: VerifierOptions): Verifier {
  const secret = opts.secret
  if (!secret || secret.length < 16) {
    throw new Error('createVerifier: secret must be at least 16 chars (use a long random string)')
  }
  const powBits = opts.powBits ?? 14
  const challengeTtlMs = opts.challengeTtlMs ?? 5 * 60_000
  const tokenTtlMs = opts.tokenTtlMs ?? 10 * 60_000
  const minScore = opts.minScore ?? 0.5
  const audience = opts.audience ?? 'default'
  const toys = opts.toys ?? DEFAULT_TOYS
  const rng = opts.rng ?? ((n: number) => randomBytes(n))
  const store = opts.replayStore

  // ---- HMAC helpers ----
  // base64url without padding — compact, URL-safe tokens
  const b64url = (buf: Buffer | string) =>
    Buffer.from(buf).toString('base64url')

  /** Sign a canonical JSON encoding of `payload`. Keyed so field order can't
   *  matter and extra fields can't sneak in. */
  const sign = (payload: unknown): string => {
    const json = stableJson(payload)
    return b64url(createHmac('sha256', secret).update(json).digest())
  }
  const verifySig = (payload: unknown, sig: string): boolean => {
    const expected = sign(payload)
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  // ---- PoW (server-side authoritative check) ----
  // MUST match src/verify/pow.ts: SHA-256(`${seed}:${solution}`), count leading
  // zero bits. Synchronous here (Node crypto is sync); the client is async.
  const zeroBits = (spec: PowSpec, solution: string): number => {
    const digest = createHash('sha256').update(Buffer.from(`${spec.seed}:${solution}`)).digest()
    return countLeadingZeros(digest)
  }

  const issueChallenge: Verifier['issueChallenge'] = (target?: ToyId): Challenge => {
    const t: ToyId = target ?? toys[Math.floor(Math.random() * toys.length)]
    const now = Date.now()
    const id = b64url(rng(18))
    const pow: PowSpec = { seed: b64url(rng(16)), bits: powBits }
    const body = { id, target: t, pow, expiresAt: now + challengeTtlMs }
    const sig = sign(body)
    return { ...body, sig }
  }

  const verifyAttempt: Verifier['verifyAttempt'] = async (input: AttemptInput): Promise<VerifyResult> => {
    const { challenge, pow, signals } = input
    // 1. signature — reject any tampering with the challenge body
    const body = { id: challenge.id, target: challenge.target, pow: challenge.pow, expiresAt: challenge.expiresAt }
    if (!verifySig(body, challenge.sig)) {
      return fail('invalid challenge signature')
    }
    // 2. expiry
    if (Date.now() > challenge.expiresAt) return fail('challenge expired')
    // 3. PoW (authoritative re-check — must match the client's hash)
    if (challenge.pow.bits >= 1) {
      if (zeroBits(challenge.pow, pow.solution) < challenge.pow.bits) {
        return fail('proof-of-work invalid')
      }
    }
    // 4. optional replay protection
    if (store) {
      const ok = await store.claimChallenge(challenge.id)
      if (!ok) return fail('challenge already used')
    }
    // 5. behavioral score
    const score = scoreSignals(signals)
    if (score.total < minScore) {
      return { ok: false, score: score.total, token: '', reason: score.reasons.join('; ') || 'below score threshold' }
    }
    // 6. mint the token
    const payload: TokenPayload = {
      target: challenge.target,
      score: score.total,
      issuedAt: Date.now(),
      expiresAt: Date.now() + tokenTtlMs,
      audience,
    }
    const token = encodeToken(payload, sign)
    return { ok: true, score: score.total, token, reason: 'verified' }
  }

  const verifyToken: Verifier['verifyToken'] = (token: string) => {
    const decoded = decodeToken(token)
    if (!decoded) return { ok: false, reason: 'malformed token' }
    const { payload, sig } = decoded
    if (!verifySig(tokenPayloadBody(payload), sig)) return { ok: false, reason: 'bad signature' }
    if (payload.audience !== audience) return { ok: false, reason: 'wrong audience' }
    if (Date.now() > payload.expiresAt) return { ok: false, reason: 'token expired' }
    return { ok: true, payload }
  }

  return { issueChallenge, verifyAttempt, verifyToken }
}

// ---- helpers exported for tests / advanced use ----

function fail(reason: string): VerifyResult {
  return { ok: false, score: 0, token: '', reason }
}

/** Canonical JSON: keys sorted, no whitespace. So {a:1,b:2} and {b:2,a:1} sign
 *  identically. */
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']'
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableJson(obj[k])).join(',') + '}'
}

function countLeadingZeros(bytes: Buffer): number {
  let bits = 0
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b === 0) {
      bits += 8
      continue
    }
    let m = 0x80
    while ((b & m) === 0) {
      bits++
      m >>= 1
    }
    break
  }
  return bits
}

/** Token format: base64url(canonicalJson(payload)).sig
 *  The signature covers the SAME canonical JSON that's encoded, so what you
 *  verify is exactly what was signed — no decode-then-restringify ambiguity. */
function encodeToken(payload: TokenPayload, sign: (p: unknown) => string): string {
  const body = tokenPayloadBody(payload)
  const json = stableJson(body)
  const sig = sign(body)
  const payloadB64 = Buffer.from(json).toString('base64url')
  return `${payloadB64}.${sig}`
}

/** The fields of a TokenPayload that participate in the signature. `audience`
 *  included; `score` included (so a low-score token can't be inflated). */
function tokenPayloadBody(p: TokenPayload): Record<string, unknown> {
  return {
    target: p.target,
    score: p.score,
    issuedAt: p.issuedAt,
    expiresAt: p.expiresAt,
    audience: p.audience,
  }
}

function decodeToken(
  token: string,
): { payload: TokenPayload; sig: string } | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  let payload: TokenPayload
  try {
    payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
  } catch {
    return null
  }
  return { payload, sig: parts[1] }
}

export { MemoryStore, type ReplayStore } from './store.ts'
export { createFetchHandler, type HandlerOptions } from './handlers.ts'
export { scoreSignals } from '../verify/signals.ts'
export type {
  AttemptInput,
  Challenge,
  ClientSignals,
  PowSpec,
  PowSolution,
  TokenPayload,
  VerifyResult,
} from '../verify/types.ts'
