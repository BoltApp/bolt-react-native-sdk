import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /**
   * Perform an HTTP request using the native networking stack.
   * Used for non-UI API calls (tokenization, merchant validation) that
   * benefit from native HTTP performance over JS fetch.
   *
   * @param method HTTP method (GET, POST, etc.)
   * @param url Full URL
   * @param headers JSON-encoded headers object
   * @param body Request body string (or empty string for no body)
   * @returns JSON-encoded response with { status, headers, body }
   */
  request(
    method: string,
    url: string,
    headers: string,
    body: string
  ): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('BoltNetworking');
