// Re-export so the test imports stay tidy; keeps the RunResult type local to tests.
export { injectToFrontmost } from '../src/index';
export type { RunResult as RunResultLike } from '@vibestick/integration-clipboard';
