import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /**
   * Check if Apple Pay is available on the device.
   */
  canMakePayments(): Promise<boolean>;

  /**
   * Present the Apple Pay payment sheet.
   *
   * @param config JSON-encoded ApplePayConfig
   * @param tokenizerUrl Primary Bolt tokenizer URL (e.g. https://production.bolttk.com)
   * @param tokenizerFallbackUrl Fallback tokenizer URL (e.g. https://tokenizer.bolt.com)
   * @returns JSON-encoded result with token, billingContact, boltReference
   */
  requestPayment(
    config: string,
    tokenizerUrl: string,
    tokenizerFallbackUrl: string
  ): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('BoltApplePay');
