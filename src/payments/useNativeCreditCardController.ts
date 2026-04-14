import { useRef, useMemo, useCallback } from 'react';
import { findNodeHandle } from 'react-native';
import { useBolt } from '../client/useBolt';
import NativeBoltCardFieldModule from '../native/NativeBoltCardFieldModule';
import type {
  TokenResult,
  EventType,
  EventCallback,
  EventListeners,
} from './types';
import type { NativeCardFieldStyles } from './NativeCardFieldStyles';

/**
 * Controller returned by NativeCreditCard.useController().
 *
 * This is a distinct interface from CreditCardController — they share
 * on() and tokenize() signatures but differ on setStyles() type (ADR-5).
 */
export interface NativeCreditCardController {
  /**
   * Ref to the native view — used by NativeCreditCard.Component.
   * Consumers should not access this directly.
   */
  nativeRef: React.RefObject<any>;
  /** @internal Listeners ref — used by NativeCreditCardComponent for event forwarding. */
  _listenersRef: React.RefObject<Partial<EventListeners>>;
  /** @internal Styles ref — used by NativeCreditCardComponent for style props. */
  _stylesRef: React.RefObject<NativeCardFieldStyles | undefined>;
  /**
   * Register an event listener for field events.
   */
  on: (eventType: EventType, callback: EventCallback) => void;
  /**
   * Tokenize the entered credit card data.
   * Returns TokenResult on success, Error on failure — never throws.
   *
   * Implemented via the companion BoltCardFieldModule TurboModule (ADR-1).
   */
  tokenize: () => Promise<TokenResult | Error>;
  /**
   * Update the styles of the native card input fields.
   */
  setStyles: (styles: NativeCardFieldStyles) => void;
}

export interface NativeCreditCardControllerOptions {
  styles?: NativeCardFieldStyles;
  showPostalCode?: boolean;
}

/**
 * Creates a controller for the native credit card input.
 *
 * Usage:
 *   const cc = NativeCreditCard.useController()
 *   <NativeCreditCard.Component controller={cc} />
 *   cc.on('valid', () => setCanSubmit(true))
 *   const result = await cc.tokenize()
 *   if (result instanceof Error) { ... }
 */
export const useNativeCreditCardController = (
  _options?: NativeCreditCardControllerOptions
): NativeCreditCardController => {
  const bolt = useBolt();
  const nativeRef = useRef<any>(null);
  const listenersRef = useRef<Partial<EventListeners>>({});
  const stylesRef = useRef<NativeCardFieldStyles | undefined>(_options?.styles);

  const on = useCallback((eventType: EventType, callback: EventCallback) => {
    listenersRef.current[eventType] = callback;
  }, []);

  const tokenize = useCallback((): Promise<TokenResult | Error> => {
    return new Promise((resolve) => {
      const viewTag = findNodeHandle(nativeRef.current);
      if (viewTag == null) {
        resolve(new Error('Native credit card view not mounted'));
        return;
      }

      if (!NativeBoltCardFieldModule) {
        resolve(new Error('BoltCardField native module not available'));
        return;
      }

      const publishableKey = bolt.publishableKey;
      const apiUrl = bolt.apiUrl;

      NativeBoltCardFieldModule.tokenize(viewTag, publishableKey, apiUrl)
        .then((resultJson: string) => {
          try {
            const parsed = JSON.parse(resultJson) as Record<string, unknown>;
            if (!parsed.token) {
              resolve(new Error('Tokenization failed: no token returned'));
              return;
            }
            resolve({
              token: parsed.token != null ? String(parsed.token) : undefined,
              last4: parsed.last4 != null ? String(parsed.last4) : undefined,
              bin: parsed.bin != null ? String(parsed.bin) : undefined,
              network:
                parsed.network != null ? String(parsed.network) : undefined,
              expiration:
                parsed.expiration != null
                  ? String(parsed.expiration)
                  : undefined,
              postal_code:
                parsed.postal_code != null
                  ? String(parsed.postal_code)
                  : undefined,
            });
          } catch {
            resolve(new Error('Failed to parse tokenization result'));
          }
        })
        .catch((err: Error) => {
          // Native module now uses promise.reject() — convert to Error
          resolve(err instanceof Error ? err : new Error(String(err)));
        });
    });
  }, [bolt]);

  const setStyles = useCallback((styles: NativeCardFieldStyles) => {
    stylesRef.current = styles;
    // Styles are applied via props on the native component.
    // The component reads stylesRef.current on each render.
  }, []);

  return useMemo(
    () => ({
      nativeRef,
      _listenersRef: listenersRef,
      _stylesRef: stylesRef,
      on,
      tokenize,
      setStyles,
    }),
    [on, tokenize, setStyles]
  );
};
