import { useRef, useMemo, useCallback, useEffect } from 'react';
import type { ViewStyle } from 'react-native';
import {
  BoltPaymentWebView,
  type BoltPaymentWebViewHandle,
} from '../bridge/BoltPaymentWebView';
import { BoltBridgeDispatcher } from '../bridge/BoltBridgeDispatcher';
import type { TokenResult } from './types';
import type WebView from 'react-native-webview';

/**
 * Controller returned by CreditCard.useController().
 * Manages the bridge dispatcher and exposes tokenize().
 */
export interface CreditCardController {
  /** Internal ref — pass to CreditCard.Component via controller prop */
  _webViewRef: React.RefObject<WebView | null>;
  /** Internal dispatcher — used by CreditCard.Component */
  _dispatcher: BoltBridgeDispatcher;
  /**
   * Tokenize the entered credit card data.
   * Sends GetToken to the WebView, waits for GetTokenReply.
   * Returns token details including last4, bin, network, expiration.
   */
  tokenize: () => Promise<TokenResult>;
  /**
   * Update the styles of the credit card input fields.
   */
  setStyles: (styles: Record<string, unknown>) => void;
}

export interface CreditCardComponentProps {
  controller: CreditCardController;
  style?: ViewStyle;
}

/**
 * CreditCard.Component — renders the Bolt credit card input WebView.
 */
function CreditCardComponent({ controller, style }: CreditCardComponentProps) {
  const webViewHandleRef = useRef<BoltPaymentWebViewHandle>(null);

  return (
    <BoltPaymentWebView
      ref={webViewHandleRef}
      element="credit-card-input"
      dispatcher={controller._dispatcher}
      style={style}
    />
  );
}

/**
 * Parse a Bolt message from the credit card iframe.
 * Messages may be double-serialized (JSON string within JSON).
 */
function parseBoltMessage(data: unknown): Record<string, unknown> | null {
  let msg = data;

  // Unwrap if it's a JSON string
  if (typeof msg === 'string') {
    try {
      msg = JSON.parse(msg);
    } catch {
      return null;
    }
  }

  if (typeof msg === 'object' && msg !== null) {
    return msg as Record<string, unknown>;
  }
  return null;
}

/**
 * CreditCard.useController() — creates a controller for the credit card input.
 *
 * Usage:
 *   const cc = CreditCard.useController()
 *   <CreditCard.Component controller={cc} />
 *   const token = await cc.tokenize()
 */
function useCreditCardController(): CreditCardController {
  const webViewRef = useRef<WebView | null>(null);
  const dispatcher = useMemo(() => new BoltBridgeDispatcher(webViewRef), []);
  // Listen for FrameInitialized and send initial config
  useEffect(() => {
    const unsub = dispatcher.onMessage((data) => {
      const msg = parseBoltMessage(data);
      if (!msg) return;

      if (
        msg.type === 'CreditCard.FrameInitialized' ||
        msg.type === 'FrameInitialized'
      ) {
        // Send SetConfig after initialization
        dispatcher.sendMessage(
          JSON.stringify({
            type: 'SetConfig',
            options: {},
          })
        );
      }
    });

    return unsub;
  }, [dispatcher]);

  const tokenize = useCallback((): Promise<TokenResult> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsub();
        reject(new Error('Tokenization timed out'));
      }, 30000);

      const unsub = dispatcher.onMessage((data) => {
        const msg = parseBoltMessage(data);
        if (!msg) return;

        if (msg.type === 'GetTokenReply') {
          clearTimeout(timeout);
          unsub();

          if (msg.error) {
            reject(new Error(String(msg.error)));
            return;
          }

          resolve({
            token: String(msg.token ?? ''),
            last4: String(msg.last4 ?? msg.ccLast4 ?? ''),
            bin: String(msg.bin ?? msg.ccBin ?? ''),
            network: String(msg.network ?? msg.ccNetwork ?? ''),
            expiration: String(msg.expiration ?? msg.ccExpiry ?? ''),
            postal_code: String(msg.postal_code ?? msg.ccPostal ?? ''),
          });
        }
      });

      // Send GetToken command to the iframe
      dispatcher.sendMessage(JSON.stringify({ type: 'GetToken' }));
    });
  }, [dispatcher]);

  const setStyles = useCallback(
    (styles: Record<string, unknown>) => {
      dispatcher.sendMessage(JSON.stringify({ type: 'SetStyles', styles }));
    },
    [dispatcher]
  );

  return useMemo(
    () => ({
      _webViewRef: webViewRef,
      _dispatcher: dispatcher,
      tokenize,
      setStyles,
    }),
    [dispatcher, tokenize, setStyles]
  );
}

/**
 * CreditCard namespace — matches Alan's spec API shape.
 *
 * Usage:
 *   const cc = CreditCard.useController()
 *   <CreditCard.Component controller={cc} />
 *   const token = await cc.tokenize()
 */
export const CreditCard = {
  Component: CreditCardComponent,
  useController: useCreditCardController,
};
