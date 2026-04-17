import { useCallback, useEffect, useState } from 'react';
import { Platform, type ViewStyle } from 'react-native';
import NativeApplePay from '../native/NativeApplePay';
import { useBolt } from '../client/useBolt';
import type {
  ApplePayResult,
  ApplePayConfig,
  ApplePayButtonType,
} from './types';
import { startSpan, SpanStatusCode } from '../telemetry/tracer';
import { BoltAttributes } from '../telemetry/attributes';
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
  const bolt = useBolt();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (mode !== 'native') return;
    if (Platform.OS !== 'ios' || !NativeApplePay) {
      setAvailable(false);
      return;
    }
    NativeApplePay.canMakePayments()
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, [mode]);

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

    try {
      const resultJson = await NativeApplePay.requestPayment(
        JSON.stringify(config),
        bolt.publishableKey,
        bolt.baseUrl
      );
      const result: ApplePayResult = JSON.parse(resultJson);

      const tokenizeSpan = startSpan('bolt.apple_pay.tokenize_success', {
        [BoltAttributes.PAYMENT_METHOD]: 'apple_pay',
        [BoltAttributes.PAYMENT_OPERATION]: 'tokenize',
      });
      tokenizeSpan.setStatus({ code: SpanStatusCode.OK });
      tokenizeSpan.end();

      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      onComplete(result);
    } catch (err) {
      const error =
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
        onError?.(error);
        return;
      }

      const tokenizeSpan = startSpan('bolt.apple_pay.tokenize_failure', {
        [BoltAttributes.PAYMENT_METHOD]: 'apple_pay',
        [BoltAttributes.PAYMENT_OPERATION]: 'tokenize',
        [BoltAttributes.ERROR_MESSAGE]: error.message,
      });
      tokenizeSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      tokenizeSpan.end();

      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      span.end();
      onError?.(error);
    }
  }, [config, bolt, onComplete, onError]);

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
