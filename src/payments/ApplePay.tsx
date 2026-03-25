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
}

/**
 * <ApplePay /> — renders a native PKPaymentButton that triggers the native
 * PassKit payment sheet via the BoltApplePay TurboModule.
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
}: ApplePayProps) => {
  const bolt = useBolt();
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
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      onComplete(result);
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Apple Pay payment failed');
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      span.end();
      onError?.(error);
    }
  }, [config, bolt, onComplete, onError]);

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
