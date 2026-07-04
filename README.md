# playcaptcha

A captcha that's a claw machine.

It asks for a toy. You drive the claw with the joystick (or arrow keys), hit the red button, the claw dives down and grabs whatever's under it. Carry the catch over the hatch and drop it in. Right toy and you're verified, wrong toy bounces off the lid and goes back on the pile.

No physics engine behind it, just damped springs and scripted phases in one rAF loop. React state only changes when the phase changes, the rest is transforms written through refs, so it stays smooth even on weak devices.

Obvious but worth saying: this checks that someone is *playing*, not who they are. Keep it in front of your real checks, don't replace them with it.

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

The 12 toy ids: `duck` `bear` `panda` `bunny` `dino` `penguin` `fox` `frog` `whale` `cat` `puppy` `unicorn`

## props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `target` | `ToyId` | random | Which toy to ask for. Randomized on each mount when omitted. |
| `onVerify` | `() => void` | — | Fired once when the right toy lands in the tray. |
| `title` | `string` | — | Heading above the machine. Defaults to the language's built-in title. |
| `assetBase` | `string` | `'/toys/'` | URL prefix for toy PNG files. |
| `className` | `string` | — | Extra class on the root element. |
| `language` | `'en' \| 'zh'` | `'en'` | UI language. Supports English and Chinese. |
| `randomizeToyPosition` | `boolean` | `true` | Randomize the target toy's position in the pile each mount. |
| `randomizeClawPosition` | `boolean` | `true` | Randomize the claw's starting position on the rail each mount. |

## language

Built-in support for English and Chinese:

```tsx
<ClawCaptcha language="zh" onVerify={() => unlock()} />
```

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
