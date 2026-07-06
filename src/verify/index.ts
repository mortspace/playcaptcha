// Client-side verification barrel: types, PoW solver, and signal collector.
// The server module (src/server) re-exports the shared types from here too.
export { solvePow, isValidPow } from './pow.ts'
export { SignalCollector, scoreSignals, type PointerSample, type ScoreBreakdown } from './signals.ts'
export type {
  Challenge,
  PowSpec,
  PowSolution,
  ClientSignals,
  AttemptInput,
  VerifyResult,
  TokenPayload,
} from './types.ts'
