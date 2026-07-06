/*
 * Optional replay-protection store. The verifier is stateless by default: a
 * signed challenge can be solved and posted back at any time within its TTL.
 * That's fine for most uses, but it means a captured (challenge, token) pair
 * could be replayed within the window.
 *
 * If you care about single-use, pass a ReplayStore. An in-memory default is
 * provided; implement the same interface against Redis / your DB for
 * multi-instance deployments.
 */

/** A store that remembers seen challenge ids / used tokens until their TTL.
 *  All methods should be safe to call concurrently. */
export interface ReplayStore {
  /** Record a challenge id at issue time. Return false if it's already known
   *  (duplicate issue — shouldn't happen with a good id generator). */
  sawChallenge(id: string, expiresAt: number): Promise<boolean> | boolean
  /** Atomically claim a challenge id for verification. Return false if it was
   *  already claimed (replay attempt). */
  claimChallenge(id: string): Promise<boolean> | boolean
  /** Atomically mark a token as used. Return false if already used (replay). */
  useToken(token: string, expiresAt: number): Promise<boolean> | boolean
}

interface Entry {
  expiresAt: number
  claimed?: boolean
}

/** In-memory ReplayStore. Fine for single-process deployments. Entries are
 *  purged lazily on access; a periodic sweep is unnecessary for typical loads. */
export class MemoryStore implements ReplayStore {
  private challenges = new Map<string, Entry>()
  private tokens = new Map<string, number>()

  private sweep(map: Map<string, Entry | number>) {
    const now = Date.now()
    for (const [k, v] of map) {
      const exp = typeof v === 'number' ? v : v.expiresAt
      if (exp <= now) map.delete(k)
    }
  }

  sawChallenge(id: string, expiresAt: number): boolean {
    this.sweep(this.challenges)
    if (this.challenges.has(id)) return false
    this.challenges.set(id, { expiresAt })
    return true
  }

  /** Atomically claim a challenge id for verification. Return false if it was
   *  already claimed (replay attempt). First claim of an unseen id succeeds. */
  claimChallenge(id: string): boolean {
    this.sweep(this.challenges)
    const e = this.challenges.get(id)
    if (e?.claimed) return false
    // record the claim even if we never saw it issued (defensive: it still
    // blocks a second claim within the TTL)
    this.challenges.set(id, { expiresAt: e?.expiresAt ?? Date.now() + 60_000, claimed: true })
    return true
  }

  useToken(token: string, expiresAt: number): boolean {
    this.sweep(this.tokens)
    if (this.tokens.has(token)) return false
    this.tokens.set(token, expiresAt)
    return true
  }
}
