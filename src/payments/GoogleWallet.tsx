import { useCallback, useEffect, useState } from 'react';
import { Platform, type ViewStyle } from 'react-native';
import NativeGooglePay from '../native/NativeGooglePay';
import { useBolt } from '../client/useBolt';
import type {
  GooglePayResult,
  GooglePayConfig,
  GooglePayButtonType,
} from './types';
import { startSpan, SpanStatusCode } from '../telemetry/tracer';
import { BoltAttributes } from '../telemetry/attributes';

// Conditional require: Metro inlines Platform.OS and eliminates the dead branch at bundle
// time, so NativeGooglePayButton (which calls codegenNativeComponent) is never loaded on
// iOS — even if the .ios.js stub is bypassed by exports-map resolution.
const BoltGooglePayButton = (
  Platform.OS === 'android'
    ? require('../native/NativeGooglePayButton').default
    : null
) as typeof import('../native/NativeGooglePayButton').default | null;

export interface GoogleWalletProps {
  config: GooglePayConfig;
  onComplete: (result: GooglePayResult) => void;
  onError?: (error: Error) => void;
  style?: ViewStyle;
  buttonType?: GooglePayButtonType;
  borderRadius?: number;
}

/**
 * <GoogleWallet /> — renders a native Google Pay button that triggers the
 * native PaymentsClient payment sheet via the BoltGooglePay TurboModule.
 *
 * Only renders on Android when Google Pay is available.
 */
export const GoogleWallet = ({
  config,
  onComplete,
  onError,
  style,
  buttonType = 'plain',
  borderRadius,
}: GoogleWalletProps) => {
  const bolt = useBolt();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android' || !NativeGooglePay) {
      setAvailable(false);
      return;
    }
    NativeGooglePay.isReadyToPay(JSON.stringify(config))
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, [config]);

  const handlePress = useCallback(async () => {
    if (!NativeGooglePay) {
      onError?.(new Error('Google Pay is not available'));
      return;
    }

    const span = startSpan('bolt.google_pay.request_payment', {
      [BoltAttributes.PAYMENT_METHOD]: 'google_pay',
      [BoltAttributes.PAYMENT_OPERATION]: 'request_payment',
    });

    try {
      const resultJson = await NativeGooglePay.requestPayment(
        JSON.stringify(config),
        bolt.publishableKey,
        bolt.baseUrl
      );
      const result: GooglePayResult = JSON.parse(resultJson);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      onComplete(result);
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Google Pay payment failed');
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      span.end();
      onError?.(error);
    }
  }, [config, bolt, onComplete, onError]);

  if (!available || !BoltGooglePayButton) {
    return null;
  }

  return (
    <BoltGooglePayButton
      buttonType={buttonType}
      borderRadius={borderRadius}
      // eslint-disable-next-line react-native/no-inline-styles
      style={[{ height: 48 }, style]}
      onPress={handlePress}
    />
  );
};
