/*
 * Shared verification types — imported by BOTH the browser component and the
 * Node/server module, so this file is environment-agnostic: no DOM globals,
 * no `node:crypto`, no React. Pure shape definitions only.
 *
 * The flow is:
 *   1. server issues a Challenge (HMAC-signed) and hands it to the client
 *   2. client solves the proof-of-work and plays the game, collecting signals
 *   3. client posts an AttemptInput back; server validates it into a VerifyResult
 *   4. server-issued token is later checked with verifyToken on protected routes
 */

import type { ToyId } from '../toys.ts'

/** Proof-of-work spec: find a `solution` so SHA-256(seed || solution) starts
 *  with `bits` zero bits. ~14 bits = a few hundred-thousand iterations,
 *  <1s on a laptop but real CPU at scale for an attacker. */
export interface PowSpec {
  seed: string
  bits: number
}

/** A challenge issued by the server. `id` is opaque to the client; the whole
 *  object is what the client hands back (signed) so the server can re-validate
 *  without storing anything. */
export interface Challenge {
  id: string
  /** A freshly sampled target the challenge asks for. When the client pins
   *  `target` itself, the server still has to agree — pass it in the request. */
  target: ToyId
  /** PoW to solve. */
  pow: PowSpec
  /** Unix ms, server clock. Attempts after this are rejected. */
  expiresAt: number
  /** HMAC of the above, base64url. Server re-computes on verify; the client
   *  never needs to read or trust this — it just round-trips it. */
  sig: string
}

/** The PoW solution the client found. */
export interface PowSolution {
  solution: string
  /** Iterations spent — reported for telemetry, not trusted. */
  attempts: number
}

/** Behavioral + anti-automation signals collected during play. All of these
 *  are CLIENT-REPORTED and therefore spoofable by a determined attacker; they
 *  feed a heuristic score, not a hard guarantee. The load-bearing guarantees
 *  are the unforgeable signed token and the real PoW cost. */
export interface ClientSignals {
  /** Pointer samples from the joystick drag (machine-space px). Used to score
   *  trajectory realism — bots tend to drive straight lines at constant speed. */
  pointer: Array<{ t: number; x: number }>
  /** Keyboard samples (ArrowLeft/Right hold/release). */
  keys: Array<{ t: number; dir: -1 | 1 }>
  /** ms from challenge load to first interaction (joystick move or key). */
  timeToFirstAction: number | null
  /** ms from challenge load to the verify POST. */
  totalDuration: number
  /** Number of grab attempts (wrong + right). */
  attempts: number
  /** Did every input event have isTrusted === true? Synthetic dispatchEvent
   *  calls produce isTrusted=false — a strong automation tell. */
  allEventsTrusted: boolean
  /** navigator.webdriver at load (true = automation driver present). */
  webdriver: boolean
  /** Crude automation UA sniff (headless chromium, puppeteer, playwright, etc.).
   *  Best-effort only; trivial to spoof. */
  automationUa: boolean
}

/** What the client posts to the verify endpoint. */
export interface AttemptInput {
  /** The original Challenge object, round-tripped. Server re-checks its sig. */
  challenge: Challenge
  pow: PowSolution
  signals: ClientSignals
}

/** Result handed back to the client (and to onVerify). `token` is present iff
 *  `ok`; the consumer later calls verifyToken(token, secret) on their protected
 *  endpoint. */
export interface VerifyResult {
  ok: boolean
  /** 0..1 heuristic humanness score. Only meaningful when ok. */
  score: number
  /** Server-signed, base64url token binding {target, score, issuedAt, expiresAt}.
   *  Empty string when !ok. */
  token: string
  /** Why it failed (or succeeded) — for client UI / logging. */
  reason?: string
}

/** The decoded payload inside a token. Consumers get this from verifyToken. */
export interface TokenPayload {
  target: ToyId
  score: number
  issuedAt: number
  expiresAt: number
  /** Same secret-domain identifier the verifier was created with — lets a
   *  consumer run multiple verifiers with different secrets and tell tokens
   *  apart. Defaults to 'default'. */
  audience: string
}
