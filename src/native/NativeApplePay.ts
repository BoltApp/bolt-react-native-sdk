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
   * @returns JSON-encoded `{ applePayToken: IPostApplePayTokenRequest, billingContact }`
   *          to be tokenized on the JS side via @boltpay/tokenizer. The PassKit
   *          sheet is held in a processing state until the caller reports
   *          the tokenization outcome via {@link reportAuthorizationResult}.
   */
  requestPayment(config: string): Promise<string>;

  /**
   * Report the JS-side tokenization outcome so PassKit can finish the sheet.
   * Must be called after every successful `requestPayment` — on success the
   * sheet shows the checkmark; on failure it shows the Apple Pay failure state.
   * No-op if no authorization is pending.
   *
   * @param success whether tokenization succeeded
   * @param errorMessage optional diagnostic string surfaced to native logs
   */
  reportAuthorizationResult(
    success: boolean,
    errorMessage: string | null
  ): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('BoltApplePay');
