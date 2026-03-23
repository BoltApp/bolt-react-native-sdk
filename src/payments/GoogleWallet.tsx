import { useCallback, useEffect, useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
  type ViewStyle,
} from 'react-native';
import NativeGooglePay from '../native/NativeGooglePay';
import { useBolt } from '../client/useBolt';
import type { GooglePayResult, GooglePayConfig } from './types';
import { startSpan, SpanStatusCode } from '../telemetry/tracer';
import { BoltAttributes } from '../telemetry/attributes';

export interface GoogleWalletProps {
  config: GooglePayConfig;
  onComplete: (result: GooglePayResult) => void;
  onError?: (error: Error) => void;
  style?: ViewStyle;
}

/**
 * <GoogleWallet /> — renders a Google Pay button that triggers the native
 * PaymentsClient payment sheet via the BoltGooglePay TurboModule.
 *
 * Only renders on Android when Google Pay is available.
 */
export const GoogleWallet = ({
  config,
  onComplete,
  onError,
  style,
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

  if (!available) {
    return null;
  }

  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={handlePress}
      accessibilityLabel="Pay with Google Pay"
      accessibilityRole="button"
    >
      <Text style={styles.buttonText}>Google Pay</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: 8,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
