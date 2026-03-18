// These values are replaced by scripts/inject-telemetry-config.js before publish.
// The auth token is injected as a pre-encoded base64 string (username:apiKey)
// so raw credentials are never present in the published bundle.
// Locally, create a .env file with BOLT_OTLP_ENDPOINT, BOLT_OTLP_USERNAME,
// and BOLT_OTLP_AUTH_TOKEN. In CI, set them as GitHub secrets.
export const OTLP_ENDPOINT =
  'https://otlp-gateway-prod-us-central-0.grafana.net/otlp';
export const OTLP_AUTH_TOKEN = '__BOLT_OTLP_AUTH_TOKEN__';
