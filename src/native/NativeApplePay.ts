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
   * @param publishableKey Bolt publishable key for merchant validation
   * @param baseUrl Bolt API base URL
   * @returns JSON-encoded result with token, billingContact, boltReference
   */
  requestPayment(
    config: string,
    publishableKey: string,
    baseUrl: string
  ): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('BoltApplePay');
