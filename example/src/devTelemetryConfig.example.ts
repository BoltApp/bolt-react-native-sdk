// Template for devTelemetryConfig.ts — copy this file, remove the .example
// suffix, and fill in your Grafana Cloud credentials.
//
// The real devTelemetryConfig.ts is gitignored. Generate it from .env by
// running: yarn gen-dev-telemetry-config
//
// Or create it manually by copying this file:
//   cp example/src/devTelemetryConfig.example.ts example/src/devTelemetryConfig.ts
//
// Set enabled: false to turn off telemetry locally without touching App.tsx.
export const devTelemetryConfig = {
  enabled: true,
  endpoint: 'YOUR_OTLP_ENDPOINT', // e.g. https://otlp-gateway-prod-us-west-0.grafana.net/otlp
  username: 'YOUR_GRAFANA_INSTANCE_ID', // numeric user/instance ID
  authToken: 'YOUR_GRAFANA_API_KEY', // glc_... API key
} as const;
