import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, type ViewStyle } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { useBolt } from '../client/useBolt';
import NativeApplePay from '../native/NativeApplePay';
import { BoltBridgeDispatcher } from '../bridge/BoltBridgeDispatcher';
import { INJECTED_BRIDGE_JS } from '../bridge/injectedBridge';
import { parseBoltMessage } from '../bridge/parseBoltMessage';
import { startSpan, SpanStatusCode } from '../telemetry/tracer';
import { BoltAttributes } from '../telemetry/attributes';
import { logger } from '../telemetry/logger';
import type {
  ApplePayBillingContact,
  ApplePayConfig,
  ApplePayResult,
  ApplePayButtonType,
} from './types';

// Maps our buttonStyle values to the iframe's buttonTheme param
const BUTTON_THEME_MAP: Record<string, string> = {
  black: 'black',
  white: 'white',
  whiteOutline: 'white-outline',
};

// Error code 1001 = Apple Pay not available on this device
const ERROR_NOT_AVAILABLE = 1001;
// Error code 1006 = user cancelled
const ERROR_CANCELLED = 1006;

interface ApplePayWebViewProps {
  config: ApplePayConfig;
  onComplete: (result: ApplePayResult) => void;
  onError?: (error: Error) => void;
  style?: ViewStyle;
  buttonStyle?: 'black' | 'white' | 'whiteOutline';
  buttonType?: ApplePayButtonType;
  referrer?: string;
}

/**
 * <ApplePayWebView /> — renders the Bolt-hosted add-card-from-apple-wallet
 * iframe in a WebView. Bolt manages merchant validation and tokenization
 * server-side, so no app entitlement or merchant certificate setup is needed.
 *
 * Only renders on iOS when Apple Pay is available.
 */
export const ApplePayWebView = ({
  config,
  onComplete,
  onError,
  style,
  buttonStyle = 'black',
  buttonType = 'plain',
  referrer,
}: ApplePayWebViewProps) => {
  const bolt = useBolt();
  const webViewRef = useRef<WebView | null>(null);
  const dispatcher = useMemo(() => new BoltBridgeDispatcher(webViewRef), []);
  // null = unknown (checking), true = available, false = not available
  const [available, setAvailable] = useState<boolean | null>(
    Platform.OS === 'ios' ? null : false
  );
  useEffect(() => {
    if (Platform.OS !== 'ios' || !NativeApplePay) {
      setAvailable(false);
      return;
    }
    NativeApplePay.canMakePayments()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, []);

  const uri = useMemo(() => {
    const url = new URL(
      '/src/iframes/add-card-from-apple-wallet/index.html',
      bolt.baseUrl
    );
    url.searchParams.set('origin', referrer ?? bolt.baseUrl);
    url.searchParams.set('publishableKey', bolt.publishableKey);
    url.searchParams.set('l', bolt.language);
    url.searchParams.set('transport', 'rn-webview');
    url.searchParams.set('countryCode', config.countryCode);
    url.searchParams.set('currencyCode', config.currencyCode);
    url.searchParams.set('amount', config.total.amount);
    url.searchParams.set('label', config.total.label);
    url.searchParams.set(
      'buttonTheme',
      BUTTON_THEME_MAP[buttonStyle] ?? 'black'
    );
    url.searchParams.set('buttonType', buttonType);
    url.searchParams.set(
      'billingContactFields',
      JSON.stringify(['postalAddress', 'name', 'email', 'phone'])
    );
    return url.toString();
  }, [bolt, config, buttonStyle, buttonType, referrer]);

  const webViewRefCallback = useCallback(
    (node: WebView | null) => {
      webViewRef.current = node;
      dispatcher.setWebView(node);
    },
    [dispatcher]
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      dispatcher.handleMessage(event);
    },
    [dispatcher]
  );

  // Subscribe to Bolt iframe messages via the dispatcher. The dispatcher
  // unwraps bridge envelopes and passes the Bolt message payload through;
  // parseBoltMessage converts it into the actual FrameToHost.
  useEffect(() => {
    const unsub = dispatcher.onMessage((data) => {
      const msg = parseBoltMessage(data);
      if (!msg) return;

      if (msg.type === 'addCardFromApplePaySuccess') {
        const message = msg.message as Record<string, unknown>;
        const tokenResult = message.token as
          | Record<string, unknown>
          | undefined;
        const billingContact = message.billingContact as
          | Record<string, unknown>
          | undefined;

        const span = startSpan('bolt.apple_pay.webview_complete', {
          [BoltAttributes.PAYMENT_METHOD]: 'apple_pay',
          [BoltAttributes.PAYMENT_OPERATION]: 'request_payment',
        });

        // Guard against a malformed success envelope: a missing token would
        // silently resolve onComplete with `token: ''`, which the caller
        // would POST to Bolt and fail server-side with no SDK trail.
        const tokenString =
          typeof tokenResult?.token === 'string' ? tokenResult.token : '';
        if (!tokenString) {
          const err = new Error('Apple Pay success event was missing a token');
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          span.recordException(err);
          span.end();
          logger.error(err.message, {
            [BoltAttributes.PAYMENT_METHOD]: 'apple_pay',
          });
          onError?.(err);
          return;
        }

        span.setStatus({ code: SpanStatusCode.OK });
        span.end();

        onComplete({
          token: tokenString,
          bin: tokenResult?.bin as string | undefined,
          expiration: tokenResult?.expiration as string | undefined,
          boltReference:
            typeof message.boltReference === 'string'
              ? message.boltReference
              : undefined,
          billingContact: billingContact
            ? mapBillingContact(billingContact)
            : undefined,
        });
        return;
      }

      if (msg.type === 'addCardFromApplePayError') {
        const message = msg.message as Record<string, unknown>;
        const errorCode = Number(message.errorCode ?? 0);
        const errorBody = String(message.message ?? '');

        if (errorCode === ERROR_NOT_AVAILABLE) {
          // The iframe reported Apple Pay unavailable after our pre-flight
          // canMakePayments() said it was available. Log + span so the
          // discrepancy shows up in telemetry — otherwise the button just
          // vanishes from the UI with no signal to the merchant.
          const span = startSpan('bolt.apple_pay.webview_unavailable_runtime', {
            [BoltAttributes.PAYMENT_METHOD]: 'apple_pay',
          });
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: errorBody || 'Apple Pay reported unavailable after mount',
          });
          span.end();
          logger.warn('Apple Pay reported unavailable after mount', {
            [BoltAttributes.ERROR_MESSAGE]: errorBody,
          });
          setAvailable(false);
          return;
        }

        if (errorCode === ERROR_CANCELLED) {
          // User dismissed the Apple Pay sheet. Not a caller-facing error;
          // the iframe resets the button state on its own.
          return;
        }

        const span = startSpan('bolt.apple_pay.webview_error', {
          [BoltAttributes.PAYMENT_METHOD]: 'apple_pay',
          [BoltAttributes.PAYMENT_OPERATION]: 'request_payment',
        });
        const errorMessage =
          errorBody ||
          `Apple Pay error ${Number.isFinite(errorCode) ? errorCode : 'unknown'}`;
        const error = new Error(errorMessage);
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
        span.recordException(error);
        span.end();

        onError?.(error);
        return;
      }

      logger.debug('Ignored unknown Apple Pay message type', {
        [BoltAttributes.BRIDGE_MESSAGE_TYPE]: String(msg.type ?? 'undefined'),
      });
    });

    return unsub;
  }, [dispatcher, onComplete, onError]);

  const handleShouldStartLoad = useCallback(
    (request: ShouldStartLoadRequest): boolean => {
      if (request.isTopFrame === false) return true;
      return (
        request.url.startsWith(bolt.baseUrl) || request.url === 'about:blank'
      );
    },
    [bolt.baseUrl]
  );

  // Don't render on Android or when confirmed unavailable
  if (available === false) {
    return null;
  }

  return (
    <WebView
      ref={webViewRefCallback}
      source={{ uri }}
      injectedJavaScriptBeforeContentLoaded={
        referrer
          ? `Object.defineProperty(document,'referrer',{get:()=>${JSON.stringify(referrer)},configurable:true});${INJECTED_BRIDGE_JS}`
          : INJECTED_BRIDGE_JS
      }
      injectedJavaScriptBeforeContentLoadedForMainFrameOnly={true}
      onMessage={handleMessage}
      originWhitelist={['https://*']}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      scrollEnabled={false}
      keyboardDisplayRequiresUserAction={false}
      onShouldStartLoadWithRequest={handleShouldStartLoad}
      style={[styles.webView, style]}
    />
  );
};

const mapBillingContact = (
  contact: Record<string, unknown>
): ApplePayBillingContact => {
  const postalAddress = contact.postalAddress as
    | Record<string, unknown>
    | undefined;
  const addressLines = contact.addressLines as string[] | undefined;

  return {
    givenName: contact.givenName as string | undefined,
    familyName: contact.familyName as string | undefined,
    emailAddress: contact.emailAddress as string | undefined,
    phoneNumber: contact.phoneNumber as string | undefined,
    postalAddress:
      postalAddress || addressLines
        ? {
            street:
              addressLines?.[0] ??
              (postalAddress?.street as string | undefined),
            city: (contact.locality ?? postalAddress?.city) as
              | string
              | undefined,
            state: (contact.administrativeArea ?? postalAddress?.state) as
              | string
              | undefined,
            postalCode: (contact.postalCode ?? postalAddress?.postalCode) as
              | string
              | undefined,
            country: (contact.country ?? postalAddress?.country) as
              | string
              | undefined,
          }
        : undefined,
  };
};

const styles = StyleSheet.create({
  webView: {
    backgroundColor: 'transparent',
    width: '100%',
    height: 48,
  },
});
