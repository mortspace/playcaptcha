// Public client API: the ClawCaptcha component + the verification utilities
// you'd reach for if you were wiring up your own transport or scoring.
// The server-side module ships separately as `playcaptcha/server`.
export { ClawCaptcha, type ClawCaptchaProps } from './ClawCaptcha.tsx'
export { TOY_META, type ToyId } from './toys.ts'
export {
  solvePow,
  isValidPow,
  SignalCollector,
  scoreSignals,
  type Challenge,
  type PowSpec,
  type PowSolution,
  type ClientSignals,
  type AttemptInput,
  type VerifyResult,
  type TokenPayload,
} from './verify/index.ts'
