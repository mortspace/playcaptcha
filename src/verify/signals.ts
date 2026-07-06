/*
 * Behavioral + anti-automation signal collection and scoring.
 *
 * Two halves:
 *   - SignalCollector: a tiny class the component instantiates per mount. It
 *     records pointer/keyboard samples and timing as the user plays, and tracks
 *     whether EVERY input event was isTrusted (real hardware) — synthetic
 *     dispatchEvent calls have isTrusted=false, a strong automation tell.
 *   - scoreSignals(): a pure function over ClientSignals returning a 0..1 score.
 *     SHARED LOGIC — the client uses it to gate its optimistic UI, the server
 *     uses it authoritatively. Keep them identical.
 *
 * HONESTY NOTE: all of these signals are client-reported and therefore
 * spoofable. They feed a heuristic, not a guarantee. The load-bearing pieces of
 * this system are the unforgeable HMAC token and the real PoW cost. Behavioral
 * scoring raises the bar for naive bot scripts; it does not stop a determined
 * attacker who reads this source.
 */

import type { ClientSignals } from './types.ts'

/** A trajectory sample in machine-space coordinates (px, relative to the
 *  joystick start, performance.now() timestamp). */
export interface PointerSample {
  t: number
  /** horizontal offset from drag start, in machine px (clamped to ±26). */
  x: number
}

export class SignalCollector {
  private readonly t0: number
  private readonly pointer: PointerSample[] = []
  private readonly keys: Array<{ t: number; dir: -1 | 1 }> = []
  private firstActionAt: number | null = null
  private attempts = 0
  private allTrusted = true
  private readonly webdriver: boolean
  private readonly automationUa: boolean

  constructor() {
    this.t0 = now()
    // sniffed once at construction; cheaper than re-checking per event
    this.webdriver = safeNav('webdriver') === true
    this.automationUa = sniffAutomationUa()
  }

  /** Record a joystick pointer move. Call from onStickMove. */
  pointerMove(x: number, trusted: boolean) {
    this.markFirst()
    if (!trusted) this.allTrusted = false
    // cap the buffer: we only need ~120 points to score a trajectory, and
    // we don't want a long aimless drag to balloon the verify POST
    if (this.pointer.length < 240) this.pointer.push({ t: now() - this.t0, x })
  }

  /** Record a keyboard direction press. Call from onKeyDown for arrows. */
  keyPress(dir: -1 | 1, trusted: boolean) {
    this.markFirst()
    if (!trusted) this.allTrusted = false
    if (this.keys.length < 240) this.keys.push({ t: now() - this.t0, dir })
  }

  /** One grab attempt was made (wrong or right — the component calls this on
   *  every `action()` that starts a grab). */
  grabAttempt() {
    this.attempts++
  }

  /** Snapshot the collected signals for the verify POST. */
  build(): ClientSignals {
    return {
      pointer: this.pointer,
      keys: this.keys,
      timeToFirstAction: this.firstActionAt,
      totalDuration: now() - this.t0,
      attempts: this.attempts,
      allEventsTrusted: this.allTrusted,
      webdriver: this.webdriver,
      automationUa: this.automationUa,
    }
  }

  private markFirst() {
    if (this.firstActionAt === null) this.firstActionAt = now() - this.t0
  }
}

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()

/** Read a property off `navigator` defensively (SSR / non-browser guards). */
function safeNav(key: string): unknown {
  try {
    return (navigator as unknown as Record<string, unknown>)[key]
  } catch {
    return undefined
  }
}

/** Best-effort UA sniff for common automation drivers. Trivially spoofable —
 *  this is a low-value gate, not a real defense. */
function sniffAutomationUa(): boolean {
  try {
    const ua = (navigator.userAgent || '').toLowerCase()
    return (
      ua.includes('headless') ||
      ua.includes('puppeteer') ||
      ua.includes('playwright') ||
      ua.includes('selenium') ||
      ua.includes('webdriver') ||
      ua.includes('phantomjs')
    )
  } catch {
    return false
  }
}

// ---- scoring (pure, shared with the server) ----

export interface ScoreBreakdown {
  total: number
  /** Each contributing signal and its 0..1 sub-score, for telemetry/logging. */
  parts: Record<string, number>
  /** Why it scored low (empty when nothing tripped). */
  reasons: string[]
}

/**
 * Score a ClientSignals object into a 0..1 humanness heuristic.
 *
 * Hard vetoes (score 0): synthetic events (isTrusted=false), navigator.webdriver
 * true, or an automation UA string. These are near-certain automation.
 *
 * Soft signals (weighted, never reaching 1.0 alone):
 *  - timing: humans take >250ms to first action and >1.5s total; a script that
 *    grabs in <100ms is suspicious.
 *  - trajectory: humans wobble. A perfectly straight, constant-velocity drag
 *    with no direction reversals reads as scripted.
 *  - cadence: a tiny number of pointer samples (e.g. 2) over a multi-second
 *    game suggests the input was injected, not dragged.
 */
export function scoreSignals(s: ClientSignals): ScoreBreakdown {
  const parts: Record<string, number> = {}
  const reasons: string[] = []

  // --- hard vetoes ---
  if (!s.allEventsTrusted) {
    parts.trusted = 0
    reasons.push('untrusted input events')
    return { total: 0, parts, reasons }
  }
  if (s.webdriver) {
    parts.webdriver = 0
    reasons.push('navigator.webdriver is true')
    return { total: 0, parts, reasons }
  }
  if (s.automationUa) {
    parts.ua = 0
    reasons.push('automation user-agent')
    return { total: 0, parts, reasons }
  }

  // --- timing ---
  // first action: ~250ms-12s is the human band. Below 150ms is almost certainly
  // scripted; above 30s is fine (a slow user) but we cap the bonus.
  let timing = 0.6
  if (s.timeToFirstAction != null) {
    const t = s.timeToFirstAction
    if (t < 150) timing = 0.05
    else if (t < 250) timing = 0.35
    else if (t <= 12000) timing = 1
    else timing = 0.8 // slow but human
  } else {
    // no input recorded at all but somehow verifying — suspicious
    timing = 0.1
    reasons.push('no input recorded')
  }
  parts.timing = timing

  // total duration: a full grab+carry+drop in <1.2s is implausible
  let total = 0.6
  if (s.totalDuration < 1200) total = 0.25
  else if (s.totalDuration < 1800) total = 0.6
  else total = 1
  parts.duration = total

  // --- trajectory realism (pointer) ---
  // measures we use, all cheap:
  //   reversals: how often the drag flipped direction (humans do this a lot
  //              while aiming; a bot driving straight does it ~0-1 times)
  //   jitter:    stdev of per-step dx — humans are noisy, bots are flat
  //   samples:   raw count of pointer events; <3 over a real drag is suspect
  let traj = 0.6
  const pts = s.pointer
  if (pts.length >= 3) {
    const reversals = countReversals(pts.map((p) => p.x))
    const jitter = stdev(deltas(pts.map((p) => p.x)))
    // humans typically show several reversals + noticeable jitter on a 380px-wide
    // machine; bots show ~0 reversals and ~0 jitter
    const revScore = clamp01(reversals / 4) // ~4 reversals → full credit
    const jitScore = clamp01(jitter / 1.6) // ~1.6px stdev → full credit
    traj = 0.4 * revScore + 0.4 * jitScore + 0.2 // floor of 0.2 even for clean drags
  } else if (s.keys.length >= 2) {
    // keyboard-only players: score on key reversals instead
    const reversals = countReversals(s.keys.map((k) => k.dir))
    traj = 0.4 + 0.6 * clamp01(reversals / 3)
  } else {
    traj = 0.2
    reasons.push('very few input samples')
  }
  parts.trajectory = traj

  // --- attempts: a single clean attempt is normal; >5 wrong grabs is a bot
  //     brute-forcing positions. We don't punish 1-3 retries (a human misses). ---
  let attemptScore = 1
  if (s.attempts > 6) {
    attemptScore = Math.max(0, 1 - (s.attempts - 6) * 0.15)
    reasons.push(`${s.attempts} grab attempts`)
  }
  parts.attempts = attemptScore

  // weighted blend — timing & trajectory carry the most weight
  const total2 = clamp01(
    0.32 * timing + 0.18 * total + 0.32 * traj + 0.18 * attemptScore,
  )
  return { total: total2, parts, reasons }
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

function deltas(xs: number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < xs.length; i++) out.push(xs[i] - xs[i - 1])
  return out
}

function countReversals(xs: number[]): number {
  let n = 0
  let prevSign = 0
  for (let i = 1; i < xs.length; i++) {
    const d = xs[i] - xs[i - 1]
    const sign = d > 0 ? 1 : d < 0 ? -1 : 0
    if (sign !== 0 && prevSign !== 0 && sign !== prevSign) n++
    if (sign !== 0) prevSign = sign
  }
  return n
}

function stdev(xs: number[]): number {
  if (xs.length === 0) return 0
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length
  return Math.sqrt(variance)
}
