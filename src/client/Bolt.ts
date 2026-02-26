export interface BoltConfig {
  publishableKey: string;
  environment?: 'production' | 'sandbox';
  language?: string;
}

const ENVIRONMENT_URLS: Record<string, string> = {
  production: 'https://connect.bolt.com',
  sandbox: 'https://connect-sandbox.bolt.com',
};

export class Bolt {
  public readonly publishableKey: string;
  public readonly baseUrl: string;
  public readonly language: string;

  constructor(config: BoltConfig) {
    if (!config.publishableKey) {
      throw new Error('Bolt: publishableKey is required');
    }

    this.publishableKey = config.publishableKey;
    this.baseUrl =
      ENVIRONMENT_URLS[config.environment ?? 'production'] ??
      ENVIRONMENT_URLS.production!;
    this.language = config.language ?? 'en';
  }
}
