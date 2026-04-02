// Template for boltConfig.ts — copy this file, remove the .example suffix,
// and fill in your Bolt publishable key.
//
// The real boltConfig.ts is gitignored. Generate it from .env by running:
//   yarn gen-bolt-config
//
// Or create it manually:
//   cp example/src/boltConfig.example.ts example/src/boltConfig.ts
export const boltConfig = {
  publishableKey: 'YOUR_PUBLISHABLE_KEY',
  environment: 'sandbox' as const, // 'production' | 'sandbox' | 'staging'
};
