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
   * @param publishableKey Bolt publishable key
   * @param baseUrl Bolt API base URL
   * @returns JSON-encoded result with token, billingAddress
   */
  requestPayment(
    config: string,
    publishableKey: string,
    baseUrl: string
  ): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('BoltGooglePay');
