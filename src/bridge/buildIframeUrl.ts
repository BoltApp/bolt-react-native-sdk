import type { BoltElementName } from './BoltPaymentWebView';

export interface IframeUrlParams {
  baseUrl: string;
  element: BoltElementName;
  publishableKey: string;
  language?: string;
  merchantClientId?: string;
}

/**
 * Constructs the URL for a Bolt iframe element, matching the format used
 * by dom-host.utils.ts in the storm codebase.
 *
 * Example output:
 *   https://connect.bolt.com/src/iframes/credit-card-input/index.html?
 *     origin=https%3A%2F%2Fconnect.bolt.com&publishableKey=pk_123&
 *     l=en&transport=rn-webview&checkoutPageID=uuid
 */
export const buildIframeUrl = (params: IframeUrlParams): string => {
  const {
    baseUrl,
    element,
    publishableKey,
    language = 'en',
    merchantClientId,
  } = params;

  const url = new URL(`/src/iframes/${element}/index.html`, baseUrl);
  url.searchParams.set('origin', baseUrl);
  url.searchParams.set('publishableKey', publishableKey);
  url.searchParams.set('l', language);
  url.searchParams.set('transport', 'rn-webview');
  url.searchParams.set(
    'checkoutPageID',
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );

  if (merchantClientId) {
    url.searchParams.set('mcid', merchantClientId);
  }

  return url.toString();
};
