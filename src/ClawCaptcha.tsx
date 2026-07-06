import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'motion/react'
import { TOY_META, type ToyId } from './toys.ts'
import { CLAW_ARM_L, CLAW_ARM_R, CLAW_BODY, CLAW_PIVOT } from './clawArt.ts'
import {
  solvePow,
  SignalCollector,
  type Challenge,
  type VerifyResult,
} from './verify/index.ts'

/*
 * ClawCaptcha — a claw-machine human check, operated like the real thing.
 *
 *  1. MOVE  — drag the joystick (or hold ◀ ▶ / arrow keys); the claw drives
 *             along its rail under a coil spring, swaying as it goes.
 *  2. GRAB  — press the action button (or Space); the spring stretches, the
 *             chrome claw descends, closes, and retracts with whatever was
 *             under it (forgiving proximity check).
 *  3. DROP  — carry the toy over the dashed tray and press again; the toy
 *             falls into the tray. Right toy = verified; wrong toy hops back
 *             into the pile and you try again.
 *
 * The pile is SCATTERED fresh on every mount (tilts, depth bands, a couple of
 * toys tossed sideways on top) and every toy is a soft body: a cheap spring on
 * offset / rotation / squash. Toys tumble in on mount, part when the claw
 * dives into them, jostle their neighbours, and wobble back to rest. Still no
 * physics engine — impulses + critically-damped springs in ONE rAF loop that
 * writes transforms via refs; React state changes only at phase boundaries.
 */

// ---- geometry (px inside the 380-wide machine area) ----
const GW = 380
const GH = 320
const RAIL_Y = 14
const HOME_Y = 64
const DROP_Y = 198
const CLAW_MIN = 46
const CLAW_MAX = 334
const COIL_LEN = 50
const GRAB_RADIUS = 38
const GRIP_OFFSET = 46 // cable end → where the gripped toy's head centre sits
const TRAY = { cx: 232, cy: GH + 56, min: 150, max: 320 }

const TOY_SET: Array<{ toy: ToyId; w: number }> = [
  { toy: 'duck', w: 96 },
  { toy: 'bear', w: 92 },
  { toy: 'panda', w: 86 },
  { toy: 'bunny', w: 78 },
  { toy: 'dino', w: 92 },
  { toy: 'penguin', w: 84 },
  { toy: 'fox', w: 80 },
  { toy: 'frog', w: 76 },
  { toy: 'whale', w: 90 },
  { toy: 'cat', w: 74 },
  { toy: 'puppy', w: 72 },
  { toy: 'unicorn', w: 82 },
]
type Slot = { toy: ToyId; w: number; x: number; b: number; z: number; rot: number; dropFrom: number; delay: number }

const rand = (a: number, b: number) => a + Math.random() * (b - a)

// one handful of confetti when the catch is swallowed — fixed layout, themed
// hues; dy is the APEX of each piece's toss (the keyframes handle the fall)
const CONFETTI = [
  { dx: -44, dy: -54, dr: -150, c: '#34c759', d: 0 },
  { dx: -30, dy: -66, dr: 120, c: '#ffd60a', d: 0.05 },
  { dx: -14, dy: -76, dr: -80, c: '#5cd679', d: 0.02 },
  { dx: 2, dy: -80, dr: 60, c: '#5a93c9', d: 0.07 },
  { dx: 16, dy: -74, dr: -130, c: '#ffb340', d: 0.03 },
  { dx: 30, dy: -64, dr: 100, c: '#a8e6b8', d: 0.06 },
  { dx: 44, dy: -52, dr: -110, c: '#34c759', d: 0.01 },
  { dx: -54, dy: -36, dr: 90, c: '#e58ab0', d: 0.09 },
  { dx: 54, dy: -34, dr: -70, c: '#5a93c9', d: 0.08 },
]

// ---- easing + timeline (all timings in SECONDS; the loop is dt-based so the
// feel is identical at 60 / 120 / 144 Hz) ----
const easeInQuad = (p: number) => p * p
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3)
const easeInOutCubic = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2)
const clamp01 = (p: number) => Math.min(1, Math.max(0, p))

const T = {
  antic: 0.16, // tiny upward anticipation before the dive
  down: 0.78, // cable pays out, accelerating
  dwell1: 0.18, // momentum carries the claw a touch past the stop, then settles
  close: 0.45, // fingers close, decelerating
  dwell2: 0.26, // grip settles before the lift
  load: 0.24, // the cable takes the toy's weight: a visible strain dip
  up: 0.95, // slow ease-in-out retract
  open: 0.4, // fingers release over the tray
}
const ANTIC_RISE = 8
const DROP_G = 1150 // gentle gravity for the toy's drop into the tray (smooth fall)
const ENTRANCE_G = 1500
const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** A fresh dumped-in heap every mount, built so nothing floats: a FRONT ROW
 *  of toys resting on the floor (b ≈ 0) and overlapping into a cluster, plus a
 *  BACK ROW drawn behind them, a size down, peeking over the valleys — their
 *  bases hide behind the front row so they read as the depth of the heap. The
 *  TARGET sits in the front row with the two gaps beside it left empty, so it
 *  always reads clearly and is easy to grab. Each toy still tumbles in under
 *  gravity (dropFrom + entrance sim) and settles on a soft spring. */
function scatterPile(target: ToyId): Slot[] {
  const order = shuffle(TOY_SET) // 12 unique toys
  const rest = order.filter((t) => t.toy !== target)
  const tgt = order.find((t) => t.toy === target)!

  const nB = 8 // floor row
  const nTop = order.length - nB // 4 nestled on top
  const bottomIdx = 2 + Math.floor(Math.random() * 4) // 2..5 — where the target rests
  const slots: Slot[] = new Array(order.length)

  // --- floor row: ON the ground, with SIZE-AWARE spacing. Each neighbour pair
  //     is spaced by a bounded fraction of their combined half-widths, so a big
  //     duck never swallows the toy beside it and a small cat never drifts off
  //     alone — the overlap is uniform whatever the shuffle dealt ---
  let r = 0
  const frontW: number[] = []
  const frontToy: Array<{ toy: ToyId; w: number }> = []
  for (let i = 0; i < nB; i++) {
    const isTarget = i === bottomIdx
    const t = isTarget ? tgt : rest[r++]
    frontToy.push(t)
    // supporting cast runs smaller than the target so the row fits the glass
    // WITHOUT compressing the spacing (compression = the bad deep overlaps)
    frontW.push(t.w * (isTarget ? rand(1.0, 1.05) : rand(0.76, 0.86)))
  }
  const xs: number[] = [0]
  for (let i = 1; i < nB; i++) {
    // ~62-68% of the half-width sum between centres ≈ a third of each toy tucked
    xs.push(xs[i - 1] + ((frontW[i - 1] + frontW[i]) / 2) * rand(0.62, 0.68))
  }
  // fit the row to the glass by scaling WIDTHS AND SPACING together — overlap
  // is scale-invariant, so a hand of big toys gets uniformly smaller toys, never
  // deeper-buried ones (compressing only the spacing is what buries them)
  const span = xs[nB - 1]
  const fit = Math.min(1, (GW - 80) / span)
  for (let i = 0; i < nB; i++) frontW[i] *= fit
  const offset = (GW - span * fit) / 2
  const centers: number[] = []
  for (let i = 0; i < nB; i++) {
    const cx = offset + xs[i] * fit + rand(-3, 3)
    centers.push(cx)
    const isTarget = i === bottomIdx
    slots[i] = {
      toy: frontToy[i].toy,
      w: frontW[i],
      x: Math.min(GW - 26, Math.max(26, cx)),
      b: rand(0, 2), // planted on the floor, not hovering over it
      z: isTarget ? 4 : 2, // target drawn in front of its neighbours
      rot: rand(-7, 7),
      dropFrom: -rand(340, 440),
      delay: i * 0.05 + rand(0, 0.1),
    }
  }

  // --- back row: peeking over the valleys BETWEEN floor toys, drawn behind
  //     them, clearly a size down and kept LOW — their bases stay hidden
  //     behind the front silhouettes, so they read as the depth of the heap,
  //     never as toys floating in mid-air. The two gaps beside the target
  //     stay empty so it always reads clearly ---
  const gaps: number[] = []
  for (let g = 0; g < nB - 1; g++) {
    if (g === bottomIdx - 1 || g === bottomIdx) continue
    gaps.push(g)
  }
  const useGaps = shuffle(gaps).slice(0, nTop)
  let ti = 0
  for (const g of useGaps) {
    const t = rest[r++]
    const cx = (centers[g] + centers[g + 1]) / 2 + rand(-3, 3)
    slots[nB + ti] = {
      toy: t.toy,
      w: t.w * rand(0.7, 0.8),
      x: Math.min(GW - 26, Math.max(26, cx)),
      b: rand(6, 16), // low: peeking over shoulders, base out of sight
      z: 1, // BEHIND the floor row
      rot: rand(-8, 8),
      dropFrom: -rand(360, 470),
      delay: 0.45 + ti * 0.08 + rand(0, 0.1), // settle in after the floor row
    }
    ti++
  }

  // one back-row toy leans a little for a lived-in heap (a lean, not a topple)
  const tip = slots[nB + Math.floor(Math.random() * nTop)]
  tip.rot = rand(10, 16) * (Math.random() < 0.5 ? -1 : 1)

  return slots
}

/** Per-toy soft body: deviations from the slot pose, each on a damped spring. */
type Soft = {
  dx: number
  dy: number
  rot: number
  sq: number
  vdx: number
  vdy: number
  vrot: number
  vsq: number
  ey: number // entrance: extra height above the slot
  evy: number
  delay: number
  landed: boolean
}

type Phase = 'idle' | 'seq' | 'carry' | 'toTray' | 'celebrate' | 'deny' | 'return' | 'done'

export interface ClawCaptchaProps {
  /** Which toy the challenge asks for. A random toy each mount when omitted.
   *  In server mode, the challenge's target wins — pass this only to pin a toy
   *  when NOT using server verification. */
  target?: ToyId
  /** Fired once when the right toy lands in the tray.
   *  - Client-only mode: called with no argument (backward compatible).
   *  - Server mode: called with `{ ok, token, score }` once the server confirms. */
  onVerify?: (result?: VerifyResult) => void
  /** Heading shown above the machine. */
  title?: string
  /** Where the toy PNGs are served from. */
  assetBase?: string
  className?: string

  // ---- server-backed verification (optional — omit all to stay client-only) ----
  /** GET a challenge from this URL. Enables server verification. */
  challengeUrl?: string
  /** Or supply your own challenge fetcher (overrides challengeUrl). */
  getChallenge?: (target?: ToyId) => Promise<Challenge>
  /** POST the attempt to this URL for verification. */
  verifyUrl?: string
  /** Or supply your own verifier (overrides verifyUrl). */
  verifyAttempt?: (input: import('./verify/types.ts').AttemptInput) => Promise<VerifyResult>
}

export function ClawCaptcha({
  target: targetProp,
  onVerify,
  title = 'Verify you’re human',
  assetBase = '/toys/',
  className,
  challengeUrl,
  getChallenge,
  verifyUrl,
  verifyAttempt,
}: ClawCaptchaProps) {
  const reduce = useReducedMotion()

  // server-backed mode is on if ANY of the four server props is set. In that
  // mode the server's challenge decides the target, PoW runs in the background,
  // and the green "verified" state only flips after the server confirms.
  const serverMode = !!(challengeUrl || getChallenge || verifyUrl || verifyAttempt)

  // unpinned challenges ask for a different toy every mount (stable within one)
  const [autoTarget] = useState<ToyId>(() => TOY_SET[Math.floor(Math.random() * TOY_SET.length)].toy)

  // the challenge's target wins in server mode; otherwise the prop / auto target
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const target: ToyId = challenge?.target ?? targetProp ?? autoTarget

  const [phase, setPhase] = useState<Phase>('idle')
  const [infoOpen, setInfoOpen] = useState(false)
  const [verified, setVerified] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [overTray, setOverTray] = useState(false)
  const [trayMode, setTrayMode] = useState<'' | 'open' | 'win' | 'no'>('')

  // fresh scatter every mount (remount with a key for a new pile)
  const pile = useMemo(() => scatterPile(target), [target])

  const rigEl = useRef<SVGSVGElement>(null)
  const clawEl = useRef<SVGGElement>(null)
  const coilEl = useRef<SVGGElement>(null)
  const fingerL = useRef<SVGGElement>(null)
  const fingerR = useRef<SVGGElement>(null)
  const carriedEl = useRef<HTMLImageElement>(null)
  const stickEl = useRef<HTMLDivElement>(null)
  const trolleyEl = useRef<HTMLDivElement>(null)
  const shadowEl = useRef<HTMLDivElement>(null)
  const machineEl = useRef<HTMLDivElement>(null)
  const trayEl = useRef<HTMLDivElement>(null)
  const pileEls = useRef<Array<HTMLImageElement | null>>([])

  const dir = useRef(0)
  const phaseRef = useRef<Phase>('idle')
  const onVerifyRef = useRef(onVerify)
  onVerifyRef.current = onVerify

  // server-mode plumbing: the PoW solution (resolved before the user finishes),
  // the signal collector (per-mount), and refs the rAF loop reads to know
  // whether to gate the verified flip on a server round-trip.
  const powRef = useRef<import('./verify/types.ts').PowSolution | null>(null)
  const signalsRef = useRef<SignalCollector | null>(null)
  if (signalsRef.current === null) signalsRef.current = new SignalCollector()
  const serverVerifyRef = useRef<(() => Promise<VerifyResult>) | null>(null)

  const sim = useRef({
    x: GW / 2,
    y: HOME_Y,
    vx: 0,
    drive: 0, // smoothed steering input (eases abrupt key/stick changes)
    sway: 0,
    swayV: 0,
    breeze: 0, // sub-degree ambient sway so the rig never freezes solid
    close: 0,
    carried: -1,
    carry: { x: 0, y: 0 },
    // scripted-sequence bookkeeping
    stage: '' as '' | 'antic' | 'down' | 'dwell1' | 'close' | 'dwell2' | 'load' | 'up' | 'open' | 'beat' | 'shine',
    st: 0, // seconds inside the current stage
    depthY: DROP_Y, // how far the cable pays out THIS grab (reaches the toy's head)
    fallV: 0,
    stretch: 0, // 0..~0.09 vertical stretch while falling fast (squash-and-stretch)
    xrot: 0, // extra rotation on the carried toy (pickup tilt / dangle lag / impact)
    swallow: 0, // 0..1 shrink+fade as a WRONG toy is dismissed off the lid
    released: false, // the claw has let go this drop (one-shot)
    mouthY: 353, // the hatch rim line in machine space — measured at release time
  })

  const softRef = useRef<Soft[] | null>(null)
  if (softRef.current === null) {
    softRef.current = pile.map((s) => ({
      dx: 0,
      dy: 0,
      rot: 0,
      sq: 0,
      vdx: 0,
      vdy: 0,
      vrot: 0,
      vsq: 0,
      ey: s.dropFrom,
      evy: 0,
      delay: s.delay,
      landed: false,
    }))
  }

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }
  const api = useRef({ setPhaseBoth, setMessage, setVerified, setVerifying, setOverTray, setTrayMode })
  api.current = { setPhaseBoth, setMessage, setVerified, setVerifying, setOverTray, setTrayMode }

  // set once on mount; the rAF loop reads it to gate the verdict
  const verifyingRef = useRef(false)

  const targetIdx = useMemo(() => pile.findIndex((p) => p.toy === target), [pile, target])

  useEffect(() => {
    const s = sim.current
    const soft = softRef.current as Soft[]
    let raf = 0
    let wasOverTray = false
    let prevNow = 0
    const speedMul = reduce ? 2.4 : 1

    if (reduce) {
      soft.forEach((b) => {
        b.ey = 0
        b.landed = true
      })
    }

    const toyCenter = (i: number) => {
      const p = pile[i]
      return { x: p.x, y: GH - p.b - (p.w / 2) * 0.92 }
    }

    /** jolt the neighbours of a landing/landed disturbance */
    const ripple = (x: number, power: number, except = -1) => {
      pile.forEach((p, i) => {
        if (i === except || i === s.carried) return
        const d = Math.abs(p.x - x)
        if (d < 80) {
          const f = (1 - d / 80) * power
          const side = p.x < x ? -1 : 1
          const b = soft[i]
          b.vdx += side * f * 1.6
          b.vdy -= f * 1.1
          b.vrot += side * f * 2
          b.vsq += f * 0.02
        }
      })
    }

    // ONE pendulum hinged at the rail: cable, claw AND carried toy all hang
    // from this same end point, so they can never detach.
    const pend = () => {
      const len = Math.max(2, s.y - RAIL_Y)
      const rad = reduce ? 0 : ((s.sway + s.breeze) * Math.PI) / 180
      return { ex: s.x + Math.sin(rad) * len, ey: RAIL_Y + Math.cos(rad) * len }
    }
    /** where the carried toy's centre sits when gripped: head between the fingers */
    const gripY = (ey: number) => ey + GRIP_OFFSET + (s.carried >= 0 ? pile[s.carried].w : 80) / 2

    /** the toy the claw would catch at horizontal position x (front row, nearest) */
    const candidateAt = (x: number) => {
      let best = -1
      let bestScore = -Infinity
      pile.forEach((q, i) => {
        const d = Math.abs(q.x - x)
        if (d < GRAB_RADIUS) {
          const score = q.z * 100 - d
          if (score > bestScore) {
            bestScore = score
            best = i
          }
        }
      })
      return best
    }

    const render = () => {
      const sway = reduce ? 0 : s.sway + s.breeze
      const len = Math.max(2, s.y - RAIL_Y)
      // the carriage rides the rail at the trolley position
      if (trolleyEl.current) trolleyEl.current.style.transform = `translateX(${(s.x - 14).toFixed(2)}px)`
      // contact shadow on the pile floor: tracks the pendulum end, tightens and
      // darkens as the claw (or its cargo) gets closer to the ground
      if (shadowEl.current) {
        const rad = (sway * Math.PI) / 180
        const ex = s.x + Math.sin(rad) * len
        const bottomY = s.carried >= 0 ? s.carry.y + pile[s.carried].w / 2 : s.y + 58
        const t = clamp01(1 - (GH - bottomY) / 210)
        shadowEl.current.style.transform = `translateX(${(ex - 45).toFixed(2)}px) scaleX(${(1.25 - 0.5 * t).toFixed(3)})`
        shadowEl.current.style.opacity = (0.1 + 0.3 * t).toFixed(3)
      }
      // cable + claw live in ONE svg coordinate space: the coil group is
      // scaled to the cable length and the claw group sits at exactly that
      // length — a gap between them is geometrically impossible
      if (rigEl.current) {
        const totalH = len + 70
        rigEl.current.setAttribute('viewBox', `0 0 36 ${totalH.toFixed(1)}`)
        rigEl.current.setAttribute('height', totalH.toFixed(1))
        rigEl.current.style.transform = `translateX(${s.x.toFixed(2)}px) rotate(${sway.toFixed(2)}deg)`
      }
      coilEl.current?.setAttribute('transform', `translate(9 0) scale(1 ${(len / 100).toFixed(4)})`)
      clawEl.current?.setAttribute('transform', `translate(18 ${len.toFixed(2)}) scale(2.5) translate(-20.6 -8.9)`)
      // arms pinch inward around the hub as the claw closes
      const pinch = 15 * s.close
      fingerL.current?.setAttribute('transform', `rotate(${pinch.toFixed(2)} ${CLAW_PIVOT.x} ${CLAW_PIVOT.y})`)
      fingerR.current?.setAttribute('transform', `rotate(${(-pinch).toFixed(2)} ${CLAW_PIVOT.x} ${CLAW_PIVOT.y})`)
      for (let i = 0; i < pile.length; i++) {
        const el = pileEls.current[i]
        if (!el) continue
        const b = soft[i]
        el.style.transform = `translate(${b.dx.toFixed(2)}px, ${(b.dy + b.ey).toFixed(2)}px) rotate(${(pile[i].rot + b.rot).toFixed(2)}deg) scale(${(1 - b.sq * 0.6).toFixed(3)}, ${(1 + b.sq).toFixed(3)})`
      }
      if (s.carried >= 0 && carriedEl.current) {
        const w = pile[s.carried].w
        // swallow drives shrink + fade together (wrong-toy dismissal only —
        // a correct catch is clipped at the hatch rim instead, never faded);
        // stretch elongates the toy with fall speed, classic squash-and-stretch
        const sc = 1 - s.swallow * 0.78
        const sx = (sc * (1 - s.stretch * 0.55)).toFixed(3)
        const sy = (sc * (1 + s.stretch)).toFixed(3)
        carriedEl.current.style.transform = `translate(${s.carry.x - w / 2}px, ${s.carry.y - w / 2}px) rotate(${(sway + s.xrot).toFixed(2)}deg) scale(${sx}, ${sy})`
        if (s.swallow > 0) carriedEl.current.style.opacity = (1 - s.swallow).toFixed(2)
      }
    }

    /** advance the scripted stage; returns eased 0..1 progress */
    const stageP = (dur: number, dt: number) => {
      s.st += dt
      return clamp01(s.st / dur)
    }
    const nextStage = (st: typeof s.stage) => {
      s.stage = st
      s.st = 0
    }

    const step = (now: number) => {
      const dtRaw = prevNow ? Math.min(0.04, Math.max(0.004, (now - prevNow) / 1000)) : 1 / 60
      prevNow = now
      const dt = dtRaw * speedMul
      const f = dt * 60 // frame-equivalent factor for the spring math
      const ph = phaseRef.current
      const a = api.current

      if (!reduce) {
        // pendulum lean opposite the trolley's motion; slower spring = a real
        // swing period instead of a vibrating one
        const lean = ph === 'idle' || ph === 'carry' ? -s.vx * 0.042 : 0
        s.swayV += (lean - s.sway) * 0.05 * f
        s.swayV *= Math.pow(0.93, f)
        s.sway += s.swayV * f
        // ambient drift: two slow sines, under a degree combined — the cable
        // breathes instead of freezing solid when nothing is happening
        s.breeze = Math.sin(now / 1500) * 0.45 + Math.sin(now / 521) * 0.12
      }

      // ---- soft bodies: entrance tumble + slow springs back to the slot pose ----
      for (let i = 0; i < soft.length; i++) {
        const b = soft[i]
        if (!b.landed) {
          if (b.delay > 0) {
            b.delay -= dt
          } else {
            b.evy += ENTRANCE_G * dt
            b.ey += b.evy * dt
            if (b.ey >= 0) {
              b.ey = 0
              b.landed = true
              // VERY subtle: a vinyl toy barely gives — a whisper of squash,
              // a faint wobble, a soft nudge to the neighbours
              b.vsq += Math.min(0.055, b.evy * 0.00006)
              b.vrot += rand(-0.8, 0.8)
              ripple(pile[i].x, Math.min(0.22, b.evy * 0.0002), i)
            }
          }
        }
        b.vdx += -b.dx * 0.055 * f
        b.vdy += -b.dy * 0.055 * f
        b.vrot += -b.rot * 0.05 * f
        b.vsq += -b.sq * 0.13 * f
        const damp = Math.pow(0.9, f)
        b.vdx *= damp
        b.vdy *= damp
        b.vrot *= Math.pow(0.91, f)
        b.vsq *= Math.pow(0.84, f)
        b.dx += b.vdx * f
        b.dy += b.vdy * f
        b.rot += b.vrot * f
        b.sq += b.vsq * f
      }

      if (ph === 'idle' || ph === 'carry') {
        // smooth, unhurried drive: ease the steering input first so key taps and
        // stick flicks ramp in, then integrate. Lower accel + more drag = a
        // calmer top speed (~130 px/s) that's easy to place over a toy.
        s.drive += (dir.current - s.drive) * (1 - Math.exp(-13 * dt))
        s.vx += s.drive * 720 * dt
        s.vx *= Math.exp(-5.5 * dt)
        s.x = Math.min(CLAW_MAX, Math.max(CLAW_MIN, s.x + s.vx * dt))
        if (ph === 'carry') {
          // the toy hangs FROM the claw, so it trails the sway a beat behind —
          // a lagged follower on its rotation reads as real dangling weight
          s.xrot += (s.sway * 0.5 - s.xrot) * (1 - Math.exp(-6 * dt))
          const { ex, ey } = pend()
          s.carry.x = ex
          s.carry.y = gripY(ey)
          const over = s.x >= TRAY.min && s.x <= TRAY.max
          if (over !== wasOverTray) {
            wasOverTray = over
            a.setOverTray(over)
          }
        }
      } else if (ph === 'seq') {
        if (s.stage === 'antic') {
          // a breath upward while the arms SPREAD wide, ready to engulf
          const p = stageP(T.antic, dt)
          s.y = HOME_Y - ANTIC_RISE * easeOutCubic(p)
          s.close = -0.55 * easeOutCubic(p) // negative = arms spread open
          if (p >= 1) {
            // pay out exactly enough cable to wrap the head of whatever is
            // under the claw — the grab happens AT the toy, never in mid-air
            const cand = candidateAt(s.x)
            if (cand >= 0) {
              const c = toyCenter(cand)
              // ey ≈ s.y when straight: solve gripY(ey) = toy centre
              s.depthY = Math.min(GH - 46, Math.max(HOME_Y + 50, c.y - GRIP_OFFSET - pile[cand].w / 2))
            } else {
              s.depthY = DROP_Y
            }
            nextStage('down')
          }
        } else if (s.stage === 'down') {
          // cable pays out, accelerating like a released winch
          const p = stageP(T.down, dt)
          s.y = HOME_Y - ANTIC_RISE + (s.depthY - HOME_Y + ANTIC_RISE) * easeInQuad(p)
          if (s.y > 130 && !reduce) {
            // the claw parts the pile as it dives in
            pile.forEach((q, i) => {
              const d = Math.abs(q.x - s.x)
              if (d < 56) {
                const push = (1 - d / 56) * 7 * dt
                const side = q.x < s.x ? -1 : 1
                soft[i].vdx += side * push
                soft[i].vsq += push * 0.012
              }
            })
          }
          if (p >= 1) nextStage('dwell1')
        } else if (s.stage === 'dwell1') {
          // the winch stops but momentum carries the claw a few px past the
          // mark and back — a sine bell, so it leaves and rejoins depthY cleanly
          const p = stageP(T.dwell1, dt)
          s.y = s.depthY + (reduce ? 0 : 3.5 * Math.sin(Math.PI * p))
          if (p >= 1) {
            s.y = s.depthY
            nextStage('close')
          }
        } else if (s.stage === 'close') {
          // from spread-wide (-0.55) all the way to gripped (1)
          const p = stageP(T.close, dt)
          s.close = -0.55 + 1.55 * easeOutCubic(p)
          if (p >= 1) {
            const best = candidateAt(s.x)
            s.carried = best
            if (best >= 0) {
              // the toy is picked up exactly where it stands, at full size AND
              // at its resting tilt — xrot starts at the pile rotation and is
              // springed upright during the lift, so nothing snaps
              s.carry = { ...toyCenter(best) }
              s.xrot = pile[best].rot + soft[best].rot
              const el = pileEls.current[best]
              if (el) el.style.visibility = 'hidden'
              ripple(pile[best].x, 0.35, best) // neighbours sag into the gap
              if (carriedEl.current) {
                carriedEl.current.src = el?.src ?? carriedEl.current.src
                carriedEl.current.style.width = `${pile[best].w}px`
                carriedEl.current.style.visibility = 'visible'
                carriedEl.current.style.opacity = '' // clear a prior fade-out
              }
            } else {
              ripple(s.x, 0.2) // empty pinch still stirs the pile
            }
            nextStage('dwell2')
          }
        } else if (s.stage === 'dwell2') {
          // an empty claw lifts straight away; a loaded one takes the weight first
          if (stageP(T.dwell2, dt) >= 1) nextStage(s.carried >= 0 && !reduce ? 'load' : 'up')
          if (s.carried >= 0) {
            s.xrot += -s.xrot * (1 - Math.exp(-3.5 * dt)) // grip rights the toy
            const { ex, ey } = pend()
            s.carry.x = ex
            s.carry.y = gripY(ey)
          }
        } else if (s.stage === 'load') {
          // the cable takes the load: a visible sag before the lift — the one
          // beat that says the toy has WEIGHT. Sine bell, so it rejoins cleanly.
          const p = stageP(T.load, dt)
          const bell = Math.sin(Math.PI * p)
          s.y = s.depthY + 6 * bell
          s.close = 1 + 0.12 * bell // the fingers bite harder as the weight comes on
          s.xrot += -s.xrot * (1 - Math.exp(-3.5 * dt))
          const { ex, ey } = pend()
          s.carry.x = ex
          s.carry.y = gripY(ey)
          if (p >= 1) {
            s.y = s.depthY
            nextStage('up')
          }
        } else if (s.stage === 'up') {
          const p = stageP(T.up, dt)
          s.y = s.depthY + (HOME_Y - s.depthY) * easeInOutCubic(p)
          if (s.carried >= 0) {
            // the toy hangs in the claw; its tilt keeps easing upright
            s.xrot += -s.xrot * (1 - Math.exp(-3.5 * dt))
            const { ex, ey } = pend()
            s.carry.x = ex
            s.carry.y = gripY(ey)
          }
          if (p >= 1) {
            if (s.carried >= 0) {
              a.setPhaseBoth('carry')
              a.setMessage(null)
            } else {
              a.setPhaseBoth('idle')
              a.setMessage('Came up empty. Try again.')
            }
          }
        }
      } else if (ph === 'toTray') {
        const right = s.carried === targetIdx
        if (s.stage === 'open') {
          const p = stageP(T.open, dt)
          s.close = 1 - easeOutCubic(p)
          if (s.st > 0.12 && !s.released) {
            s.released = true // fingers part: the toy lets go (one-shot)
            if (right) {
              a.setTrayMode('open') // the hatch slides open to receive it
              if (reduce) {
                // reduced motion: no flight — straight to the verdict
                if (carriedEl.current) carriedEl.current.style.visibility = 'hidden'
                s.carried = -1
                a.setOverTray(false)
                a.setTrayMode('win')
                nextStage('beat')
                a.setPhaseBoth('celebrate')
              } else {
                // measure the hatch rim line in the toy's own coordinate space
                // so the clip line sits EXACTLY on the tray's top edge
                const m = machineEl.current?.getBoundingClientRect()
                const tr = trayEl.current?.getBoundingClientRect()
                if (m && tr) s.mouthY = tr.top - m.top + 2
                s.fallV = 30 // and gravity takes it from here
              }
            } else {
              s.fallV = 40 // a wrong toy just drops onto the closed lid
            }
          }
        }
        // RIGHT toy: free fall into the open hatch. No arc, no fade — the toy
        // drops under the same gravity as everything else, drifts gently over
        // the mouth, and is SWALLOWED by the rim: a clip line fixed at the
        // tray's top edge eats it from the bottom up while it dims into the
        // dark of the chute. Reads as going INTO the machine, not vanishing.
        if (right && s.released && s.carried >= 0) {
          s.fallV = Math.min(s.fallV + DROP_G * dt, 460)
          s.carry.y += s.fallV * dt
          s.carry.x += (TRAY.cx - s.carry.x) * (1 - Math.exp(-2.2 * dt))
          s.xrot += -s.xrot * (1 - Math.exp(-4 * dt)) // falls upright
          s.stretch = (Math.abs(s.fallV) / 460) * 0.09 // elongates with speed
          const w = pile[s.carried].w
          const sunk = s.carry.y + w / 2 - s.mouthY
          if (sunk > 0 && carriedEl.current) {
            carriedEl.current.style.clipPath = `inset(0 0 ${sunk.toFixed(1)}px 0)`
            carriedEl.current.style.filter = `brightness(${Math.max(0.4, 1 - (sunk / w) * 0.75).toFixed(3)})`
          }
          if (sunk >= w + 4) {
            // fully below the rim — it's in the machine now
            if (carriedEl.current) {
              carriedEl.current.style.visibility = 'hidden'
              carriedEl.current.style.clipPath = ''
              carriedEl.current.style.filter = ''
            }
            s.carried = -1 // gone — stops the JSX re-showing it
            a.setOverTray(false)
            a.setTrayMode('win') // hatch shuts behind it, slot lights green + ring
            nextStage('beat')
            a.setPhaseBoth('celebrate')
          }
        }
        // WRONG toy: gravity drop onto the closed lid, bounce, reject
        if (!right && s.fallV !== 0) {
          s.fallV = Math.min(s.fallV + DROP_G * dt, 360)
          s.carry.y += s.fallV * dt
          s.carry.x += (TRAY.cx - s.carry.x) * (1 - Math.exp(-4 * dt))
          s.xrot += -s.xrot * (1 - Math.exp(-3 * dt)) // straighten in free fall
          s.stretch = (Math.abs(s.fallV) / 460) * 0.09 // same fall physics
          if (s.fallV > 0 && s.carry.y >= TRAY.cy) {
            if (s.fallV > 200) {
              s.carry.y = TRAY.cy
              s.fallV = -s.fallV * 0.28
              s.xrot += rand(-7, 7) // the impact knocks it off-kilter
            } else {
              s.carry.y = TRAY.cy
              s.fallV = 0
              s.stretch = 0 // at rest on the lid
              a.setOverTray(false)
              a.setTrayMode('no')
              a.setMessage(
                `That’s the ${TOY_META[pile[s.carried].toy].label}! Find the ${TOY_META[target].label}.`,
              )
              nextStage('beat')
              a.setPhaseBoth('deny')
            }
          }
        }
      } else if (ph === 'celebrate') {
        // right toy: a short beat in the tray, then the verdict fires —
        // green ring + check + dimmed glass. No hop, no waggle.
        if (s.stage === 'beat') {
          if (stageP(0.28, dt) >= 1) {
            // server-backed: gate the verdict on an async round-trip. The rAF
            // loop can't await, so we flip a flag, kick off the POST, and let
            // its .then() do the verified/deny transition. The loop idles here
            // (stage stays 'beat', already at p>=1) until the promise resolves.
            const run = serverVerifyRef.current
            if (run && !verifyingRef.current) {
              verifyingRef.current = true
              api.current.setVerifying(true)
              run()
                .then((result) => {
                  if (result.ok) {
                    nextStage('shine')
                    api.current.setVerified(true) // ring + check + dim run together
                    api.current.setVerifying(false)
                    verifyingRef.current = false
                    onVerifyRef.current?.(result)
                  } else {
                    // server rejected — treat like a wrong-toy deny so the user
                    // can retry, but surface the server's reason if it gave one
                    api.current.setVerifying(false)
                    verifyingRef.current = false
                    api.current.setTrayMode('no')
                    api.current.setMessage(
                      result.reason ? `Couldn’t verify: ${result.reason}` : 'Verification failed. Try again.',
                    )
                    api.current.setPhaseBoth('deny')
                  }
                })
                .catch(() => {
                  api.current.setVerifying(false)
                  verifyingRef.current = false
                  api.current.setTrayMode('no')
                  api.current.setMessage('Network error during verification. Try again.')
                  api.current.setPhaseBoth('deny')
                })
            }
            // client-only: fire immediately, same as before
            if (!run) {
              nextStage('shine')
              api.current.setVerified(true)
              onVerifyRef.current?.()
            }
          }
        } else if (s.stage === 'shine') {
          if (stageP(0.7, dt) >= 1) api.current.setPhaseBoth('done')
        }
      } else if (ph === 'deny') {
        // wrong toy: the rejected catch is drawn back UP off the closed lid and
        // dismissed — it shrinks and fades together (render reads s.swallow for
        // both), reading as "nope, back you go" rather than a flat in-place fade.
        if (s.stage === 'beat') {
          const p = stageP(0.46, dt)
          s.swallow = easeOutCubic(p) // shrink + fade in one gesture
          s.carry.y -= 46 * dt // lifted away as it vanishes
          if (p >= 1) {
            const idx = s.carried
            api.current.setTrayMode('')
            // the toy is back in its slot, with a faint settle
            const el = pileEls.current[idx]
            if (el) el.style.visibility = ''
            if (carriedEl.current) {
              carriedEl.current.style.visibility = 'hidden'
              carriedEl.current.style.opacity = ''
              carriedEl.current.style.clipPath = ''
              carriedEl.current.style.filter = ''
            }
            s.swallow = 0
            const b = soft[idx]
            b.vsq += 0.05
            b.vrot += rand(-1, 1)
            ripple(pile[idx].x, 0.25, idx)
            s.carried = -1
            a.setPhaseBoth('idle')
          }
        }
      }

      render()
      raf = requestAnimationFrame(step)
    }

    render()
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [reduce, targetIdx, target, pile])

  // ---- server-backed verification: fetch the challenge on mount, solve the
  // PoW in the background (it finishes well before a human does), and stand up
  // a verify closure the rAF loop calls when the right toy lands. Skipped
  // entirely in client-only mode. ----
  useEffect(() => {
    if (!serverMode) {
      serverVerifyRef.current = null
      return
    }
    let cancelled = false
    const powAbort = new AbortController()

    const fetcher =
      getChallenge ??
      (async (t?: ToyId) => {
        const url = challengeUrl + (t ? `?target=${encodeURIComponent(t)}` : '')
        const res = await fetch(url, { headers: { accept: 'application/json' } })
        if (!res.ok) throw new Error(`challenge fetch failed: ${res.status}`)
        return (await res.json()) as Challenge
      })

    fetcher(targetProp)
      .then((ch) => {
        if (cancelled) return
        setChallenge(ch)
        // kick off the PoW — it resolves into powRef; the verify closure waits
        // on the same promise so it can't fire before the solve is done
        const powPromise = solvePow(ch.pow, { signal: powAbort.signal }).then(
          (sol) => {
            powRef.current = sol
            return sol
          },
        )
        // build the verify closure the rAF loop will invoke. Returns the
        // server's verdict; the loop's .then() handles the UI transition.
        serverVerifyRef.current = async () => {
          const signals = signalsRef.current!.build()
          const pow = await powPromise
          const input = { challenge: ch, pow, signals }
          if (verifyAttempt) return verifyAttempt(input)
          const res = await fetch(verifyUrl!, {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(input),
          })
          if (!res.ok) throw new Error(`verify failed: ${res.status}`)
          return (await res.json()) as VerifyResult
        }
      })
      .catch(() => {
        if (!cancelled) setMessage('Couldn’t reach the verification service.')
      })

    return () => {
      cancelled = true
      powAbort.abort()
      serverVerifyRef.current = null
    }
    // re-run only if the server-mode config identity changes; target is handled
    // by the challenge that comes back, not by re-fetching
  }, [serverMode, challengeUrl, getChallenge, verifyUrl, verifyAttempt, targetProp])

  // ---- controls ----
  const action = () => {
    const s = sim.current
    if (verified) return
    // server mode: no-op until the challenge + PoW are staged (button is also
    // disabled, but keyboard Space bypasses that)
    if (serverMode && !serverVerifyRef.current) return
    if (phaseRef.current === 'idle') {
      // server mode: count every grab attempt for the behavioral score
      if (serverMode) signalsRef.current?.grabAttempt()
      setMessage(null)
      s.close = 0
      s.stage = 'antic'
      s.st = 0
      setPhaseBoth('seq')
    } else if (phaseRef.current === 'carry') {
      if (s.x >= TRAY.min && s.x <= TRAY.max) {
        if (carriedEl.current) {
          carriedEl.current.style.visibility = 'visible'
          carriedEl.current.style.opacity = ''
          carriedEl.current.style.clipPath = ''
          carriedEl.current.style.filter = ''
        }
        s.stage = 'open'
        s.st = 0
        s.fallV = 0
        s.swallow = 0
        s.stretch = 0
        s.released = false
        setOverTray(false) // neutral hatch until it opens (right) or rejects (wrong)
        setPhaseBoth('toTray')
      } else {
        setMessage('Move the toy over the drop zone first.')
      }
    }
  }

  const stickDrag = useRef<{ id: number; startX: number } | null>(null)
  const onStickDown = (e: React.PointerEvent) => {
    if (verified) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    stickDrag.current = { id: e.pointerId, startX: e.clientX }
    if (stickEl.current) stickEl.current.style.transition = 'none'
  }
  const onStickMove = (e: React.PointerEvent) => {
    const d = stickDrag.current
    if (!d || e.pointerId !== d.id) return
    const dx = Math.max(-26, Math.min(26, e.clientX - d.startX))
    dir.current = dx / 26
    // server mode: record the joystick trajectory + whether the event was
    // dispatched by real hardware (isTrusted). Synthetic events are isTrusted
    // false — a strong automation tell.
    if (serverMode) signalsRef.current?.pointerMove(dx, e.nativeEvent.isTrusted)
    // a stick only ROTATES around its ball joint — it never leaves the socket
    if (stickEl.current) stickEl.current.style.transform = `rotate(${(dx * 1.05).toFixed(1)}deg)`
  }
  const onStickUp = (e: React.PointerEvent) => {
    if (stickDrag.current?.id !== e.pointerId) return
    stickDrag.current = null
    dir.current = 0
    if (stickEl.current) {
      stickEl.current.style.transition = 'transform 0.25s cubic-bezier(0.2, 1.6, 0.4, 1)'
      stickEl.current.style.transform = ''
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (infoOpen) {
      if (e.key === 'Escape') setInfoOpen(false)
      return
    }
    if (verified) return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      dir.current = -1
      if (serverMode) signalsRef.current?.keyPress(-1, e.nativeEvent.isTrusted)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      dir.current = 1
      if (serverMode) signalsRef.current?.keyPress(1, e.nativeEvent.isTrusted)
    } else if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault()
      action()
    }
  }
  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') dir.current = 0
  }

  const t = TOY_META[target]
  // busy = mid-animation OR the server is mid-verify OR (server mode and the
  // challenge/PoW isn't ready yet — the user would just hit a missing closure)
  const challengeLoading = serverMode && !serverVerifyRef.current
  const busy = verifying || challengeLoading || (phase !== 'idle' && phase !== 'carry')
  const stepNo = verified || phase === 'carry' || phase === 'toTray' || phase === 'celebrate' ? 3 : phase === 'seq' ? 2 : 1
  const carried = sim.current.carried
  const carriedW = carried >= 0 ? pile[carried].w : 80

  return (
    // app-wide reduced-motion safety net: under prefers-reduced-motion, Motion
    // drops transform/position animation and keeps opacity — meaningful state
    // still reads, nothing slides.
    <MotionConfig reducedMotion="user">
    <motion.div
      className={className ? `clawcap ${className}` : 'clawcap'}
      role="group"
      aria-label="Claw machine verification"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      initial={reduce ? false : { opacity: 0, y: 16, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <header className="clawcap-top">
        <motion.span
          key={verified ? 'ok' : verifying ? 'verifying' : 'idle'}
          className={
            verified
              ? 'clawcap-shield clawcap-shield--ok'
              : verifying
                ? 'clawcap-shield clawcap-shield--verifying'
                : 'clawcap-shield'
          }
          aria-hidden="true"
          initial={verified ? { scale: 0.55 } : false}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 20 }}
        >
          <svg viewBox="0 0 20 20" width="14" height="14">
            <path
              d="M10 2.2 4 4.6v4.6c0 4 2.6 6.7 6 8.2 3.4-1.5 6-4.2 6-8.2V4.6Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            {verified && <path d="m7 9.8 2.2 2.2L13.4 7.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
        </motion.span>
        <button
          type="button"
          className="clawcap-help"
          aria-label="About PlayCaptcha"
          aria-haspopup="dialog"
          onClick={() => setInfoOpen(true)}
        >
          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
            <circle cx="10" cy="10" r="7.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 8.2c.2-1.2 1-1.9 2.1-1.9 1.2 0 2 .8 2 1.8 0 1.6-2.1 1.7-2.1 3.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="10" cy="13.9" r="0.9" fill="currentColor" />
          </svg>
        </button>
      </header>

      <AnimatePresence>
        {infoOpen && (
          <motion.div
            className="clawcap-info"
            role="dialog"
            aria-modal="true"
            aria-label="About PlayCaptcha"
            onClick={() => setInfoOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <motion.div
              className="clawcap-info-card"
              onClick={(e) => e.stopPropagation()}
              initial={reduce ? false : { opacity: 0, scale: 0.92, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              // exit shorter & simpler than the spring enter
              exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.13, ease: 'easeOut' } }}
              transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            >
              <button
                type="button"
                className="clawcap-info-x"
                aria-label="Close"
                onClick={() => setInfoOpen(false)}
              >
                <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
                  <path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </button>

              <div className="clawcap-info-head">
                <span className="clawcap-info-tile">
                  <img src="/playcaptcha.svg" alt="" aria-hidden="true" />
                </span>
                <h4 className="clawcap-info-title">
                  PlayCaptcha <span className="clawcap-info-ver">v1</span>
                </h4>
                <p className="clawcap-info-tag">Catch the right toy to prove you’re human.</p>
              </div>

              <ol className="clawcap-info-list">
                {(
                  [
                    ['Move', <>Line the claw up right over your prize — joystick or <kbd>←</kbd> <kbd>→</kbd></>],
                    ['Grab', <>Commit. The claw dives, bites and hauls it up — red button or <kbd>Space</kbd></>],
                    ['Drop', <>Ferry it to the hatch and let go. Wrong toy? Straight back on the pile</>],
                  ] as const
                ).map(([label, desc], i) => (
                  <li key={label}>
                    <span className="clawcap-info-n">{i + 1}</span>
                    <span>
                      <strong>{label}</strong>
                      <span className="clawcap-info-d">{desc}</span>
                    </span>
                  </li>
                ))}
              </ol>

              <button type="button" className="clawcap-info-done" onClick={() => setInfoOpen(false)}>
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* title + challenge crossfade between states instead of hard-cutting */}
      <h3 className="clawcap-title">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={verified ? 'verified' : 'title'}
            style={{ display: 'inline-block' }}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          >
            {verified ? 'Verified' : title}
          </motion.span>
        </AnimatePresence>
      </h3>
      <p className="clawcap-sub" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={verified ? 'done' : verifying ? 'verifying' : challengeLoading ? 'loading' : (message ?? 'challenge')}
            style={{ display: 'inline-block' }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {verified ? (
              'You’re human. Nice catch.'
            ) : verifying ? (
              'Verifying with the server…'
            ) : challengeLoading ? (
              'Preparing a challenge…'
            ) : message ? (
              message
            ) : (
              <>
                Use the claw to pick up the{' '}
                <em style={{ color: t.accent }}>
                  <img className="clawcap-sub-toy" src={`${assetBase}${target}.png`} alt="" draggable={false} />
                  {t.label}
                </em>
              </>
            )}
          </motion.span>
        </AnimatePresence>
      </p>

      <ol className="clawcap-steps" aria-hidden="true">
        {/* one shared pill that SLIDES between segments */}
        <span className="clawcap-steps-pill" style={{ transform: `translateX(${(stepNo - 1) * 100}%)` }} />
        {(['Move', 'Grab', 'Drop'] as const).map((label, i) => (
          <li key={label} className={stepNo === i + 1 ? 'is-active' : undefined}>
            <span className="clawcap-step-n">{i + 1}</span> {label}
          </li>
        ))}
      </ol>

      <div ref={machineEl} className="clawcap-machine">
        <div className="clawcap-case">
          <div className={verified ? 'clawcap-glass clawcap-glass--dim' : 'clawcap-glass'}>
            <div className="cc-rail" />
            {/* the carriage the cable actually hangs from */}
            <div ref={trolleyEl} className="cc-trolley" aria-hidden="true" />
            {/* contact shadow cast by the claw / its cargo, driven in the rAF */}
            <div ref={shadowEl} className="cc-claw-shadow" aria-hidden="true" />

            {pile.map((p, i) => (
              <img
                key={p.toy}
                ref={(el) => {
                  pileEls.current[i] = el
                }}
                className="cc-toy"
                src={`${assetBase}${p.toy}.png`}
                alt=""
                draggable={false}
                style={{
                  left: p.x - p.w / 2,
                  bottom: p.b,
                  width: p.w,
                  zIndex: p.z,
                  transform: `translateY(${p.dropFrom}px)`,
                  transformOrigin: '50% 100%',
                }}
              />
            ))}
            <div className="cc-pile-shadow" />

            {/* the rig: cable + claw drawn in ONE svg. The coil group is
                scaled to the cable length, the claw group sits at exactly
                that length — same coordinate space, no seams possible. */}
            <svg ref={rigEl} className="cc-rig" width="36" height={COIL_LEN + 70} viewBox={`0 0 36 ${COIL_LEN + 70}`} aria-hidden="true">
              <g ref={coilEl} transform={`translate(9 0) scale(1 ${COIL_LEN / 100})`}>
                <path
                  d="M9 0 L9 5 C 15 7.5 15 9.5 9 12 C 3 14.5 3 16.5 9 19 C 15 21.5 15 23.5 9 26 C 3 28.5 3 30.5 9 33 C 15 35.5 15 37.5 9 40 C 3 42.5 3 44.5 9 47 C 15 49.5 15 51.5 9 54 C 3 56.5 3 58.5 9 61 C 15 63.5 15 65.5 9 68 C 3 70.5 3 72.5 9 75 C 15 77.5 15 79.5 9 82 C 3 84.5 3 86.5 9 89 C 15 91.5 15 93.5 9 95 L 9 100"
                  fill="none"
                  stroke="#9A9FA8"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
              <g ref={clawEl} transform={`translate(18 ${COIL_LEN}) scale(2.5) translate(-20.6 -8.9)`}>
                <g ref={fingerL}>
                  {CLAW_ARM_L.map((p, i) => (
                    <path key={i} fill={p.fill} d={p.d} />
                  ))}
                </g>
                <g ref={fingerR}>
                  {CLAW_ARM_R.map((p, i) => (
                    <path key={i} fill={p.fill} d={p.d} />
                  ))}
                </g>
                {CLAW_BODY.map((p, i) => (
                  <path key={i} fill={p.fill} d={p.d} />
                ))}
              </g>
            </svg>

            <div className="cc-glass-shine" />
          </div>

          <div className="clawcap-panel">
            <div
              className="cc-joy"
              role="slider"
              aria-label="Move the claw"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(((sim.current.x - CLAW_MIN) / (CLAW_MAX - CLAW_MIN)) * 100)}
              onPointerDown={onStickDown}
              onPointerMove={onStickMove}
              onPointerUp={onStickUp}
              onPointerCancel={onStickUp}
            >
              <div className="cc-joy-base" />
              <div ref={stickEl} className="cc-joy-stick">
                <div className="cc-joy-shaft" />
                <div className="cc-joy-ball" />
              </div>
            </div>

            <div
              ref={trayEl}
              className={
                'cc-tray' +
                (trayMode === 'open'
                  ? ' cc-tray--open'
                  : trayMode === 'win'
                    ? ' cc-tray--win'
                    : trayMode === 'no'
                      ? ' cc-tray--no'
                      : overTray
                        ? ' cc-tray--hot'
                        : '')
              }
            >
              {/* the hatch: a dark interior under two doors that part to
                  swallow a correct catch. Clipped so the doors slide out of
                  sight; the success ring lives on the tray itself, uncliped. */}
              <span className="cc-tray-hatch" aria-hidden="true">
                <span className="cc-tray-mouth" />
                <span className="cc-tray-door cc-tray-door--l" />
                <span className="cc-tray-door cc-tray-door--r" />
                {/* one seamless skin over the closed doors — the split only
                    exists while the hatch is actually open */}
                <span className="cc-tray-skin" />
              </span>
              {trayMode === 'win' && !reduce && (
                <span className="cc-confetti" aria-hidden="true">
                  {CONFETTI.map((p, i) => (
                    <i
                      key={i}
                      style={
                        {
                          background: p.c,
                          animationDelay: `${p.d}s`,
                          '--dx': `${p.dx}px`,
                          '--dy': `${p.dy}px`,
                          '--dr': `${p.dr}deg`,
                        } as React.CSSProperties
                      }
                    />
                  ))}
                </span>
              )}
              <span className="cc-tray-label">
                {trayMode === 'win' ? (
                  // a clean check — the catch is in
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path d="m3.6 8.6 2.9 2.9 6-6.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : trayMode === 'no' ? (
                  // try-again loop — it goes back to the pile
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path d="M13.2 8A5.2 5.2 0 1 1 11.6 4.25" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M11.7 1.5v2.9h2.9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  // a toy over the parted slot — this is where the catch goes in
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <circle cx="8" cy="4.9" r="2.7" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M2.4 12.1h3.7M9.9 12.1h3.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                )}
                <span>{trayMode === 'win' ? 'Nice catch!' : trayMode === 'no' ? 'Hmm, wrong toy' : overTray ? 'Release!' : 'Drop here'}</span>
              </span>
            </div>

            <button
              type="button"
              className={phase === 'carry' && overTray ? 'cc-action cc-action--ready' : 'cc-action'}
              onClick={action}
              disabled={busy || verified}
              aria-label={phase === 'carry' ? 'Drop the toy' : 'Grab'}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={phase === 'carry' ? 'drop' : 'grab'}
                  style={{ display: 'inline-block' }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.16, ease: 'easeOut' }}
                >
                  {phase === 'carry' ? 'Drop' : 'Grab'}
                </motion.span>
              </AnimatePresence>
            </button>
          </div>
        </div>

        <img
          ref={carriedEl}
          className="cc-carried"
          src={carried >= 0 ? `${assetBase}${pile[carried].toy}.png` : `${assetBase}${target}.png`}
          alt=""
          draggable={false}
          style={{
            width: carriedW,
            visibility: carried >= 0 && phase !== 'idle' ? 'visible' : 'hidden',
          }}
        />
      </div>

      <p className="clawcap-hint">Joystick or ← → to move · Space to grab &amp; drop</p>
    </motion.div>
    </MotionConfig>
  )
}
