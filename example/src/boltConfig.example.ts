// Template for boltConfig.ts — copy this file, remove the .example suffix,
// and fill in your Bolt publishable key.
//
// The real boltConfig.ts is gitignored. Generate it from .env by running:
//   yarn gen-bolt-config
//
// Or create it manually:
//   cp example/src/boltConfig.example.ts example/src/boltConfig.ts
export const boltConfig = {
  publishableKey:
    'Q-5UMctK0oYN.ilCdYSP4NIPM.86e026dc5718eb7de83a55482f384cfcaf6be4c88df3b138d976188a4213e482',
  environment: 'staging' as const, // 'production' | 'sandbox' | 'staging'
};
