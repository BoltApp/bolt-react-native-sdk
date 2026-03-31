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

export class Bolt {
  public readonly publishableKey: string;
  public readonly baseUrl: string;
  public readonly apiUrl: string;
  public readonly language: string;
  private onPageStyles?: Styles;

  constructor(config: BoltConfig) {
    if (!config.publishableKey) {
      throw new Error('Bolt: publishableKey is required');
    }

    const env = config.environment ?? 'production';
    this.publishableKey = config.publishableKey;
    this.baseUrl = ENVIRONMENT_URLS[env] ?? ENVIRONMENT_URLS.production!;
    this.apiUrl = API_URLS[env] ?? API_URLS.production!;
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
}
