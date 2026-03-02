import { useRef, useMemo, useCallback, useEffect } from 'react';
import type { RefObject } from 'react';
import { BoltBridgeDispatcher } from '../bridge/BoltBridgeDispatcher';
import { parseBoltMessage } from '../bridge/parseBoltMessage';
import { useBolt } from '../client/useBolt';
import {
  validationErrorMap,
  type Styles,
  type TokenResult,
  type EventType,
  type EventCallback,
  type EventListeners,
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
  setStyles: (styles: Styles) => void;
}

export interface CreditCardControllerOptions {
  styles?: Styles;
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
export const useCreditCardController = (
  options?: CreditCardControllerOptions
): CreditCardController => {
  const bolt = useBolt();
  const webViewRef = useRef<WebView | null>(null);
  const dispatcher = useMemo(() => new BoltBridgeDispatcher(webViewRef), []);
  const listenersRef = useRef<Partial<EventListeners>>({});
  const optionsRef = useRef(options);

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
              config: {
                styles: optionsRef.current?.styles,
                onPageStyles: bolt.getOnPageStyles(),
              },
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
  }, [dispatcher, bolt]);

  const on = useCallback((eventType: EventType, callback: EventCallback) => {
    listenersRef.current[eventType] = callback;
  }, []);

  const tokenize = useCallback((): Promise<TokenResult | Error> => {
    return new Promise((resolve) => {
      let resolved = false;
      let firstError: Error | null = null;
      let errorDebounce: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        resolved = true;
        clearTimeout(overallTimeout);
        if (errorDebounce !== null) clearTimeout(errorDebounce);
        unsub();
      };

      const overallTimeout = setTimeout(() => {
        if (resolved) return;
        cleanup();
        resolve(firstError ?? new Error('Tokenization timed out'));
      }, 30000);

      const unsub = dispatcher.onMessage((data) => {
        if (resolved) return;
        const msg = parseBoltMessage(data);
        if (!msg || msg.type !== 'GetTokenReply') return;

        const token = msg.token as Record<string, unknown> | undefined;

        // Success case: token contains actual card data (has 'token' field, no 'errorMessage')
        if (
          token &&
          typeof token === 'object' &&
          'token' in token &&
          !('errorMessage' in token)
        ) {
          cleanup();
          resolve({
            token:
              token.token !== undefined && token.token !== null
                ? String(token.token)
                : undefined,
            last4:
              token.last4 !== undefined && token.last4 !== null
                ? String(token.last4)
                : undefined,
            bin:
              token.bin !== undefined && token.bin !== null
                ? String(token.bin)
                : undefined,
            network:
              token.network !== undefined && token.network !== null
                ? String(token.network)
                : undefined,
            expiration:
              token.expiration !== undefined && token.expiration !== null
                ? String(token.expiration)
                : undefined,
            postal_code:
              msg.ccPostal !== undefined && msg.ccPostal !== null
                ? String(msg.ccPostal)
                : undefined,
          });
          return;
        }

        // Error case: token is { errorMessage: number | string }
        // Collect the first error but don't resolve yet — a success reply may follow.
        if (
          !firstError &&
          (msg.error ||
            (token && typeof token === 'object' && 'errorMessage' in token))
        ) {
          const rawError =
            msg.error ?? token?.errorMessage ?? 'Tokenization failed';
          const code =
            typeof rawError === 'number' ? rawError : Number(rawError);
          const message = validationErrorMap.get(code) ?? String(rawError);
          firstError = new Error(message);
        }

        // Reset debounce: resolve with error if no success arrives within 1.5s
        if (errorDebounce !== null) clearTimeout(errorDebounce);
        errorDebounce = setTimeout(() => {
          if (resolved) return;
          cleanup();
          resolve(firstError ?? new Error('Tokenization failed'));
        }, 1500);
      });

      dispatcher.sendMessage(JSON.stringify({ type: 'GetToken' }));
    });
  }, [dispatcher]);

  const setStyles = useCallback(
    (styles: Styles) => {
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
