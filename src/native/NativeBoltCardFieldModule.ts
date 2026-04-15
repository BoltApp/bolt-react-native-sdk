import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /**
   * Tokenize the card data currently held by the native view identified by viewTag.
   *
   * The native module looks up the view, reads raw byte buffers (never JS strings),
   * POSTs to the Bolt tokenization endpoint, zeros all card buffers on every exit
   * path, and resolves with a JSON-encoded TokenResult.
   *
   * @param viewTag React tag of the mounted BoltCreditCardField
   * @param publishableKey Bolt publishable key for Authorization header
   * @param apiUrl Bolt API base URL (api.bolt.com or api-sandbox.bolt.com)
   * @returns JSON-encoded TokenResult or error
   */
  tokenize(
    viewTag: number,
    publishableKey: string,
    apiUrl: string
  ): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('BoltCardField');
