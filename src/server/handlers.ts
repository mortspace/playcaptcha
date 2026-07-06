/*
 * Reference Fetch handler — a single function turning a Verifier into a
 * `(Request) => Promise<Response>`. Standard Web Fetch shape, so it drops
 * directly into:
 *   - Cloudflare Workers (`export default { fetch }`)
 *   - Hono / Nano Fetch apps
 *   - Next.js Route Handlers (export async function POST(req) { return handler(req) })
 *   - Bun.serve
 *   - Express via a small adapter (req → Request)
 *
 * Routes:
 *   GET  /             → issue a challenge       (optional ?target=duck)
 *   POST /             → verify an attempt       (body: AttemptInput JSON)
 *
 * Mount it on whatever path you like — the handler doesn't care about the URL,
 * only the method. For token verification on your protected endpoints, call
 * `verifier.verifyToken(token)` directly; that doesn't need an HTTP route.
 */

import type { AttemptInput, Challenge, VerifyResult } from '../verify/types.ts'
import { TOY_META, type ToyId } from '../toys.ts'
import type { Verifier } from './index.ts'

export interface HandlerOptions {
  /** Allowed origin for CORS (default '*'). Set to your site in production. */
  corsOrigin?: string | ((req: Request) => string)
}

export function createFetchHandler(verifier: Verifier, opts: HandlerOptions = {}) {
  const { corsOrigin = '*' } = opts

  const corsHeaders = (req: Request): Record<string, string> => {
    const origin = typeof corsOrigin === 'function' ? corsOrigin(req) : corsOrigin
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    }
  }

  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req)

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }

    try {
      if (req.method === 'GET') {
        const url = new URL(req.url)
        const targetParam = url.searchParams.get('target')
        const target =
          targetParam && targetParam in TOY_META ? (targetParam as ToyId) : undefined
        const challenge: Challenge = await verifier.issueChallenge(target)
        return json(challenge, 200, cors)
      }

      if (req.method === 'POST') {
        let body: AttemptInput
        try {
          body = (await req.json()) as AttemptInput
        } catch {
          return json({ ok: false, score: 0, token: '', reason: 'invalid JSON body' } satisfies VerifyResult, 400, cors)
        }
        if (!body?.challenge || !body?.pow || !body?.signals) {
          return json({ ok: false, score: 0, token: '', reason: 'missing fields' } satisfies VerifyResult, 400, cors)
        }
        const result: VerifyResult = await verifier.verifyAttempt(body)
        // 200 either way — the client reads `ok` from the body. A 4xx would
        // trip fetch()'s throw-on-error patterns unnecessarily; a failed
        // verification is an expected response, not an HTTP error.
        return json(result, 200, cors)
      }

      return json({ ok: false, score: 0, token: '', reason: 'method not allowed' } satisfies VerifyResult, 405, cors)
    } catch (err) {
      // never leak internals — a generic 500
      const msg = err instanceof Error ? err.message : 'internal error'
      return json({ ok: false, score: 0, token: '', reason: msg } satisfies VerifyResult, 500, cors)
    }
  }
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  })
}
