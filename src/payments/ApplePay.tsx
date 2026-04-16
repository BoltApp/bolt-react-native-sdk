import { useCallback, useEffect, useState } from 'react';
import { Platform, type ViewStyle } from 'react-native';
import { type IPostApplePayTokenRequest } from '@boltpay/tokenizer';
import NativeApplePay from '../native/NativeApplePay';
import { useTkClient } from '../client/useTkClient';
import type {
  ApplePayResult,
  ApplePayConfig,
  ApplePayButtonType,
  ApplePayBillingContact,
} from './types';
import { startSpan, SpanStatusCode } from '../telemetry/tracer';
import { BoltAttributes } from '../telemetry/attributes';
import { logger } from '../telemetry/logger';
import { ApplePayWebView } from './ApplePayWebView';

// Conditional require: Metro inlines Platform.OS and eliminates the dead branch at bundle
// time, so NativeApplePayButton (which calls codegenNativeComponent) is never loaded on
// Android — even if the .android.js stub is bypassed by exports-map resolution.
const BoltApplePayButton = (
  Platform.OS === 'ios'
    ? require('../native/NativeApplePayButton').default
    : null
) as typeof import('../native/NativeApplePayButton').default | null;

export interface ApplePayProps {
  config: ApplePayConfig;
  onComplete: (result: ApplePayResult) => void;
  onError?: (error: Error) => void;
  style?: ViewStyle;
  buttonStyle?: 'black' | 'white' | 'whiteOutline';
  buttonType?: ApplePayButtonType;
  /**
   * Payment mode. Defaults to `'webview'` which uses the Bolt-hosted Apple Pay
   * iframe (no entitlement or merchant certificate required). Set to `'native'`
   * to use the native PKPaymentButton + PassKit sheet — requires an Apple Pay
   * entitlement and a registered merchant identifier in your app.
   */
  mode?: 'webview' | 'native';
  /**
   * Your merchant website URL (webview mode only). Must match a domain
   * registered in both your Bolt merchant account and with Apple for
   * Apple Pay. Required because React Native WebView has no browser referrer.
   */
  referrer?: string;
}

/**
 * <ApplePay /> — renders an Apple Pay button.
 *
 * In `mode='webview'` (default): loads the Bolt-hosted add-card-from-apple-wallet
 * iframe. No entitlement or merchant certificate setup required.
 *
 * In `mode='native'`: renders a native PKPaymentButton and triggers the PassKit
 * payment sheet. Requires Apple Pay entitlement + registered merchant identifier.
 *
 * Only renders on iOS when Apple Pay is available.
 */
export const ApplePay = ({
  config,
  onComplete,
  onError,
  style,
  buttonStyle = 'black',
  buttonType = 'plain',
  mode = 'webview',
  referrer,
}: ApplePayProps) => {
  // Split native vs. webview rendering before calling native-only hooks so
  // webview consumers don't pay the eager TkClient construction cost
  // (public-key fetch + tweetnacl keypair) that useTkClient triggers.
  if (mode !== 'native') {
    return (
      <ApplePayWebView
        config={config}
        onComplete={onComplete}
        onError={onError}
        style={style}
        buttonStyle={buttonStyle}
        buttonType={buttonType}
        referrer={referrer}
      />
    );
  }

  return (
    <ApplePayNative
      config={config}
      onComplete={onComplete}
      onError={onError}
      style={style}
      buttonStyle={buttonStyle}
      buttonType={buttonType}
    />
  );
};

interface ApplePayNativeProps {
  config: ApplePayConfig;
  onComplete: (result: ApplePayResult) => void;
  onError?: (error: Error) => void;
  style?: ViewStyle;
  buttonStyle?: 'black' | 'white' | 'whiteOutline';
  buttonType?: ApplePayButtonType;
}

const ApplePayNative = ({
  config,
  onComplete,
  onError,
  style,
  buttonStyle = 'black',
  buttonType = 'plain',
}: ApplePayNativeProps) => {
  const tkClient = useTkClient();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !NativeApplePay) {
      setAvailable(false);
      return;
    }
    NativeApplePay.canMakePayments()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, []);

  const handlePress = useCallback(async () => {
    if (!NativeApplePay) {
      onError?.(new Error('Apple Pay is not available'));
      return;
    }

    const buttonSpan = startSpan('bolt.apple_pay.button_pressed', {
      [BoltAttributes.PAYMENT_METHOD]: 'apple_pay',
      [BoltAttributes.PAYMENT_OPERATION]: 'button_pressed',
    });
    buttonSpan.setStatus({ code: SpanStatusCode.OK });
    buttonSpan.end();

    const span = startSpan('bolt.apple_pay.request_payment', {
      [BoltAttributes.PAYMENT_METHOD]: 'apple_pay',
      [BoltAttributes.PAYMENT_OPERATION]: 'request_payment',
    });

    // PassKit keeps the Apple Pay sheet in a processing state between
    // `requestPayment` resolving and `reportAuthorizationResult` being called.
    // Track the outcome so the `finally` block reports it regardless of how we
    // exit the try. Treat `requestPayment` rejections (user cancel, early
    // native errors) as "nothing pending" — the sheet is already dismissed.
    let reachedAuthorization = false;
    let success = false;
    let lastError: Error | undefined;
    let result: ApplePayResult | undefined;

    try {
      const rawJson = await NativeApplePay.requestPayment(
        JSON.stringify(config)
      );
      reachedAuthorization = true;

      const raw: {
        applePayToken?: IPostApplePayTokenRequest;
        billingContact?: ApplePayBillingContact;
      } = JSON.parse(rawJson);

      if (!raw?.applePayToken) {
        throw new Error('Native Apple Pay response missing applePayToken');
      }

      const tokenResult = await tkClient.postApplePayToken(raw.applePayToken);
      if (tokenResult instanceof Error) throw tokenResult;

      result = {
        token: tokenResult.token,
        bin: tokenResult.bin,
        expiration: tokenResult.expiry,
        billingContact: raw.billingContact,
      };
      success = true;

      const tokenizeSpan = startSpan('bolt.apple_pay.tokenize_success', {
        [BoltAttributes.PAYMENT_METHOD]: 'apple_pay',
        [BoltAttributes.PAYMENT_OPERATION]: 'tokenize',
      });
      tokenizeSpan.setStatus({ code: SpanStatusCode.OK });
      tokenizeSpan.end();

      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    } catch (err) {
      lastError =
        err instanceof Error ? err : new Error('Apple Pay payment failed');
      const nativeCode = (err as { code?: string }).code;

      if (nativeCode === 'CANCELLED') {
        const cancelSpan = startSpan('bolt.apple_pay.cancelled', {
          [BoltAttributes.PAYMENT_METHOD]: 'apple_pay',
          [BoltAttributes.PAYMENT_CANCELLED]: true,
        });
        cancelSpan.setStatus({ code: SpanStatusCode.OK });
        cancelSpan.end();
        span.setStatus({ code: SpanStatusCode.OK, message: 'user_cancelled' });
        span.end();
        onError?.(lastError);
        return;
      }

      const tokenizeSpan = startSpan('bolt.apple_pay.tokenize_failure', {
        [BoltAttributes.PAYMENT_METHOD]: 'apple_pay',
        [BoltAttributes.PAYMENT_OPERATION]: 'tokenize',
        [BoltAttributes.ERROR_MESSAGE]: lastError.message,
      });
      tokenizeSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: lastError.message,
      });
      tokenizeSpan.end();

      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: lastError.message,
      });
      span.recordException(lastError);
      span.end();
      onError?.(lastError);
    } finally {
      if (reachedAuthorization) {
        // Invoke the retained PassKit completion so the sheet transitions to
        // success/failure. `success` reflects tokenization outcome and is
        // unaffected by any later consumer-callback throw — the sheet lock-in
        // happens here, before onComplete runs.
        NativeApplePay.reportAuthorizationResult(
          success,
          lastError?.message ?? null
        ).catch((reportErr) => {
          // The native method resolves even on internal failure today, so a
          // rejection here means a bridge/contract change — log so we can
          // catch it rather than silently dropping the signal.
          logger.error('apple_pay.report_authorization_result_failed', {
            error:
              reportErr instanceof Error
                ? reportErr.message
                : String(reportErr),
          });
        });
      }
    }

    // onComplete runs outside the try/catch so a throwing consumer callback
    // stays with the consumer — it must not be recorded to telemetry as a
    // payment error or routed to onError. Guard with a log so it doesn't
    // surface as an unhandled rejection from this async handler.
    if (result) {
      try {
        onComplete(result);
      } catch (cbErr) {
        logger.error('apple_pay.on_complete_threw', {
          error: cbErr instanceof Error ? cbErr.message : String(cbErr),
        });
      }
    }
  }, [config, tkClient, onComplete, onError]);

  if (!available || !BoltApplePayButton) {
    return null;
  }

  return (
    <BoltApplePayButton
      buttonType={buttonType}
      buttonStyle={buttonStyle}
      // eslint-disable-next-line react-native/no-inline-styles
      style={[{ height: 48 }, style]}
      onPress={handlePress}
    />
  );
};
