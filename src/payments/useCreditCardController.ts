import { useRef, useMemo, useCallback, useEffect } from 'react';
import type { RefObject } from 'react';
import { BoltBridgeDispatcher } from '../bridge/BoltBridgeDispatcher';
import { parseBoltMessage } from '../bridge/parseBoltMessage';
import type {
  TokenResult,
  EventType,
  EventCallback,
  EventListeners,
} from './types';
import type WebView from 'react-native-webview';

/**
 * Controller returned by CreditCard.useController().
 * Matches the CreditCardInputElement interface from the web embedded SDK.
 */
export interface CreditCardController {
  /** Ref to the underlying WebView — used by CreditCard.Component */
  webViewRef: RefObject<WebView | null>;
  /** Bridge dispatcher — used by CreditCard.Component */
  dispatcher: BoltBridgeDispatcher;
  /**
   * Register an event listener for field events.
   * Matches element.on() from the web SDK.
   */
  on: (eventType: EventType, callback: EventCallback) => void;
  /**
   * Tokenize the entered credit card data.
   * Returns TokenResult on success, Error on failure — never throws.
   * Matches element.tokenize() from the web SDK.
   */
  tokenize: () => Promise<TokenResult | Error>;
  /**
   * Update the styles of the credit card input fields.
   */
  setStyles: (styles: Record<string, unknown>) => void;
}

/**
 * Creates a controller for the credit card input.
 *
 * Usage:
 *   const cc = CreditCard.useController()
 *   <CreditCard.Component controller={cc} />
 *   cc.on('valid', () => setCanSubmit(true))
 *   const result = await cc.tokenize()
 *   if (result instanceof Error) { ... }
 */
export const useCreditCardController = (): CreditCardController => {
  const webViewRef = useRef<WebView | null>(null);
  const dispatcher = useMemo(() => new BoltBridgeDispatcher(webViewRef), []);
  const listenersRef = useRef<Partial<EventListeners>>({});

  // Listen for FrameInitialized and field events
  useEffect(() => {
    const unsub = dispatcher.onMessage((data) => {
      const msg = parseBoltMessage(data);
      if (!msg) return;

      switch (msg.type) {
        case 'CreditCard.FrameInitialized':
        case 'FrameInitialized':
          dispatcher.sendMessage(
            JSON.stringify({
              type: 'SetConfig',
              options: {},
            })
          );
          break;
        case 'Focus':
          (listenersRef.current.focus as (() => void) | undefined)?.();
          break;
        case 'Blur':
          (listenersRef.current.blur as (() => void) | undefined)?.();
          break;
        case 'Valid':
          (listenersRef.current.valid as (() => void) | undefined)?.();
          break;
        case 'Error':
          (listenersRef.current.error as ((e: string) => void) | undefined)?.(
            String(msg.message ?? '')
          );
          break;
      }
    });

    return unsub;
  }, [dispatcher]);

  const on = useCallback((eventType: EventType, callback: EventCallback) => {
    listenersRef.current[eventType] = callback;
  }, []);

  const tokenize = useCallback((): Promise<TokenResult | Error> => {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        unsub();
        resolve(new Error('Tokenization timed out'));
      }, 30000);

      const unsub = dispatcher.onMessage((data) => {
        const msg = parseBoltMessage(data);
        if (!msg) return;

        if (msg.type === 'GetTokenReply') {
          clearTimeout(timeout);
          unsub();

          if (
            msg.error ||
            (msg.token &&
              typeof msg.token === 'object' &&
              'errorMessage' in (msg.token as object))
          ) {
            const errorMessage =
              msg.error ??
              (msg.token as Record<string, unknown>)?.errorMessage ??
              'Tokenization failed';
            resolve(new Error(String(errorMessage)));
            return;
          }

          resolve({
            token: msg.token != null ? String(msg.token) : undefined,
            last4:
              msg.last4 != null
                ? String(msg.last4)
                : msg.ccLast4 != null
                  ? String(msg.ccLast4)
                  : undefined,
            bin:
              msg.bin != null
                ? String(msg.bin)
                : msg.ccBin != null
                  ? String(msg.ccBin)
                  : undefined,
            network:
              msg.network != null
                ? String(msg.network)
                : msg.ccNetwork != null
                  ? String(msg.ccNetwork)
                  : undefined,
            expiration:
              msg.expiration != null
                ? String(msg.expiration)
                : msg.ccExpiry != null
                  ? String(msg.ccExpiry)
                  : undefined,
            postal_code:
              msg.postal_code != null
                ? String(msg.postal_code)
                : msg.ccPostal != null
                  ? String(msg.ccPostal)
                  : undefined,
          });
        }
      });

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
      webViewRef,
      dispatcher,
      on,
      tokenize,
      setStyles,
    }),
    [dispatcher, on, tokenize, setStyles]
  );
};
