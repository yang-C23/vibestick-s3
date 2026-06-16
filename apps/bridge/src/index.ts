import { startBridge } from './bridge';

startBridge().catch((e: unknown) => {
  console.error('vibestickd failed to start:', e);
  process.exit(1);
});
