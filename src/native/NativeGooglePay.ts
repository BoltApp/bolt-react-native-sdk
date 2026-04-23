import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /**
   * Check if Google Pay is available on the device.
   */
  isReadyToPay(config: string): Promise<boolean>;

  /**
   * Present the Google Pay payment sheet and return the raw payment data.
   *
   * @param config JSON-encoded GooglePayConfig
   * @returns JSON-encoded { googlePayToken, email?, billingAddress? } — tokenization happens in JS
   */
  requestPayment(config: string): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('BoltGooglePay');
