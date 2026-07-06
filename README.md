# playcaptcha

A captcha that's a claw machine.

It asks for a toy. You drive the claw with the joystick (or arrow keys), hit the red button, the claw dives down and grabs whatever's under it. Carry the catch over the hatch and drop it in. Right toy and you're verified, wrong toy bounces off the lid and goes back on the pile.

No physics engine behind it, just damped springs and scripted phases in one rAF loop. React state only changes when the phase changes, the rest is transforms written through refs, so it stays smooth even on weak devices.

Obvious but worth saying: out of the box this checks that someone is *playing*, not who they are — `onVerify()` is a client callback a bot can call directly. For a real guarantee, wire up the [server module](#server-verification) below (signed challenges, proof-of-work, behavioral scoring). Keep it in front of your real checks either way, don't replace them with it.

<video src="https://github.com/user-attachments/assets/bc6bd3f6-173a-4aa8-a2ac-09cb47742179" controls muted loop width="420"></video>

Try it live: https://feralui.vercel.app/#/captcha

This is part of [FeralUI](https://github.com/mortspace/feralui).

## setup

```bash
npm install playcaptcha
```

Then copy the `assets/` folder into whatever your app serves statically. The component looks for the toy renders under `/toys/` and the logo at `/playcaptcha.svg` by default, `assetBase` moves that.

```tsx
import { ClawCaptcha } from 'playcaptcha'
import 'playcaptcha/clawcaptcha.css'

<ClawCaptcha onVerify={() => unlock()} />
```

Leave `target` off and every mount asks for a different random toy. Or pin one:

```tsx
<ClawCaptcha target="duck" onVerify={() => unlock()} />
```

The 12 toy ids: duck, bear, panda, bunny, dino, penguin, fox, frog, whale, cat, puppy, unicorn.

Other props: `title` (the heading), `assetBase`, `className`. That's all of them — unless you want server-backed verification (see below).

## server verification

The widget above is **client-only**: `onVerify()` fires the moment the right toy lands, and there's nothing a backend can trust in that. A bot can read this source and call the callback directly. That's fine for friction gates (slow spammers down, keep real users happy), not for anything that needs an actual guarantee.

For real guarantees, ship the companion server module. It issues HMAC-signed challenges, the client solves a proof-of-work and plays the game (collecting behavioral + anti-automation signals), and only the server mints a token you can verify on your protected endpoints. The token can't be forged without your secret.

```bash
npm install playcaptcha
```

**Server** (Node, any framework — the module is framework-agnostic):

```ts
import { createVerifier, createFetchHandler } from 'playcaptcha/server'

// keep this secret on the server — long random string, in env, never bundled
const verifier = createVerifier({
  secret: process.env.PLAYCAPTCHA_SECRET!,
  powBits: 14,          // leading-zero bits; 14 ≈ a few hundred-k iters, <1s on a laptop
  challengeTtlMs: 5 * 60_000,
  tokenTtlMs: 10 * 60_000,
  minScore: 0.5,        // behavioral humanness threshold (0..1)
  // replayStore: new MemoryStore(),  // opt into single-use challenges (blocks replay)
})

// ready-made Fetch handler (GET issue / POST verify) — Cloudflare Workers,
// Hono, Next.js route handlers, Bun.serve all speak this shape
export const onRequest = createFetchHandler(verifier)
```

Mount it on any path. `GET /` issues a challenge, `POST /` verifies one. On your protected endpoints, validate the token:

```ts
import { createVerifier } from 'playcaptcha/server'
const verifier = createVerifier({ secret: process.env.PLAYCAPTCHA_SECRET! })

function isHuman(req: Request): boolean {
  const token = req.headers.get('X-Captcha-Token') ?? ''
  const { ok } = verifier.verifyToken(token)  // stateless — checks HMAC + expiry
  return ok
}
```

**Client** — point the widget at those endpoints:

```tsx
import { ClawCaptcha } from 'playcaptcha'
import 'playcaptcha/clawcaptcha.css'

<ClawCaptcha
  challengeUrl="/api/captcha"
  verifyUrl="/api/captcha"
  onVerify={(result) => {
    if (result?.ok) {
      // result.token is the signed token — send it with your real requests
      localStorage.setItem('captcha', result.token)
      unlock()
    }
  }}
/>
```

In server mode the green "Verified" state only flips **after** the server confirms — a bot that fakes the client can't make the UI lie. The props: `challengeUrl`/`getChallenge` (fetch a challenge) and `verifyUrl`/`verifyAttempt` (post it back). Bring your own transport by passing the `*Challenge`/`verifyAttempt` functions instead of URLs.

### how it actually defends

- **Signed challenges & tokens** — an attacker can't mint a valid token without your server secret. This is the load-bearing piece; everything else raises the bar.
- **Proof-of-work** — the client grinds SHA-256 to a target difficulty before it can verify. Free for one real user, costly at spam scale. Defaults to 14 bits (≈ a few hundred-thousand hashes).
- **Behavioral signals** — joystick trajectory (curvature, jitter, reversals), time-to-first-action, total duration, grab-attempt count. Bots that drive in straight lines at constant speed score low.
- **Anti-automation** — `event.isTrusted` on every input (synthetic `dispatchEvent` calls are `isTrusted=false`), `navigator.webdriver`, and automation user-agent strings trip a hard veto.

### honest limits

The client reports its own signals and its own PoW solution — the server can't *prove* the grab happened, only that a valid challenge came back with a valid solution and a high score. The real defenses are the unforgeable token and the PoW cost; the behavioral score catches naive bot scripts. This is the same shape as reCAPTCHA / hCaptcha. If you need true proof-of-work-at-the-edge or ML risk scoring, layer something stronger on top. For multi-instance deployments, implement `ReplayStore` against Redis so challenges and tokens can't be replayed across instances.

## theming

CSS vars on any ancestor:

```css
:root {
  --clawcap-bg: #ffffff;     /* card */
  --clawcap-ink: #1c1c1e;    /* text */
  --clawcap-muted: #8a8a8e;
  --clawcap-accent: #1c1c1e; /* dialog button + focus ring */
  --clawcap-action: #ff5159; /* the big red button */
}
```

Keyboard runs the whole thing (arrows + space/enter), the joystick is a real slider role, and prefers-reduced-motion swaps the decorative stuff (entrance tumble, confetti, ring pulse) for instant state changes.

MIT. Toy renders live in assets/toys.
