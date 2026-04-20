import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /**
   * Check if Google Pay is available on the device.
   */
  isReadyToPay(config: string): Promise<boolean>;

  /**
   * Present the Google Pay payment sheet.
   *
   * @param config JSON-encoded GooglePayConfig
   * @param tokenizerUrl Primary Bolt tokenizer URL (e.g. https://production.bolttk.com)
   * @param tokenizerFallbackUrl Fallback tokenizer URL (e.g. https://tokenizer.bolt.com)
   * @returns JSON-encoded result with token, email, billingAddress, boltReference
   */
  requestPayment(
    config: string,
    tokenizerUrl: string,
    tokenizerFallbackUrl: string
  ): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('BoltGooglePay');
