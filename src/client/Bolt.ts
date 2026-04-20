import type { Styles } from '../payments/types';
import { initTelemetry } from '../telemetry/setup';
import { logger } from '../telemetry/logger';

export interface BoltConfig {
  publishableKey: string;
  environment?: 'production' | 'sandbox' | 'staging';
  language?: string;
}

const ENVIRONMENT_URLS: Record<string, string> = {
  production: 'https://connect.bolt.com',
  sandbox: 'https://connect-sandbox.bolt.com',
  staging: 'https://connect-staging.bolt.com',
};

const API_URLS: Record<string, string> = {
  production: 'https://api.bolt.com',
  sandbox: 'https://api-sandbox.bolt.com',
  staging: 'https://api-staging.bolt.com',
};

// Tokenizer service (tk) — hosts /token, /token/applepay, /token/googlepay, /public_key.
// Primary: *.bolttk.com. Fallback: tokenizer-*.bolt.com. Mirrors @boltpay/tokenizer.
const TOKENIZER_URLS: Record<string, string> = {
  production: 'https://production.bolttk.com',
  sandbox: 'https://sandbox.bolttk.com',
  staging: 'https://staging.bolttk.com',
};
const TOKENIZER_FALLBACK_URLS: Record<string, string> = {
  production: 'https://tokenizer.bolt.com',
  sandbox: 'https://tokenizer-sandbox.bolt.com',
  staging: 'https://tokenizer-staging.bolt.com',
};

export class Bolt {
  public readonly publishableKey: string;
  public readonly environment: 'production' | 'sandbox' | 'staging';
  public readonly baseUrl: string;
  public readonly apiUrl: string;
  public readonly tokenizerUrl: string;
  public readonly tokenizerFallbackUrl: string;
  public readonly language: string;
  private onPageStyles?: Styles;

  constructor(config: BoltConfig) {
    if (!config.publishableKey) {
      throw new Error('Bolt: publishableKey is required');
    }

    const env = config.environment ?? 'production';
    this.publishableKey = config.publishableKey;
    this.environment = env;
    this.baseUrl = ENVIRONMENT_URLS[env] ?? ENVIRONMENT_URLS.production!;
    this.apiUrl = API_URLS[env] ?? API_URLS.production!;
    this.tokenizerUrl = TOKENIZER_URLS[env] ?? TOKENIZER_URLS.production!;
    this.tokenizerFallbackUrl =
      TOKENIZER_FALLBACK_URLS[env] ?? TOKENIZER_FALLBACK_URLS.production!;
    this.language = config.language ?? 'en';

    initTelemetry(config);
    logger.info('Bolt client initialized', {
      environment: config.environment ?? 'production',
      publishableKey: config.publishableKey.slice(0, 8) + '...',
    });
  }

  configureOnPageStyles(styles: Styles): void {
    this.onPageStyles = styles;
  }

  getOnPageStyles(): Styles | undefined {
    return this.onPageStyles;
  }

  /**
   * Returns the standard HTTP headers required for Bolt REST API calls.
   * Centralised here so every API caller uses a consistent header name.
   */
  apiHeaders(): Record<string, string> {
    return {
      'X-Publishable-Key': this.publishableKey,
    };
  }
}
