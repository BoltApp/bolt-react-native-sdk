import { useCallback, useEffect, useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
  type ViewStyle,
} from 'react-native';
import NativeApplePay from '../native/NativeApplePay';
import { useBolt } from '../client/useBolt';
import type { ApplePayResult, ApplePayConfig } from './types';

export interface ApplePayProps {
  config: ApplePayConfig;
  onComplete: (result: ApplePayResult) => void;
  onError?: (error: Error) => void;
  style?: ViewStyle;
  buttonStyle?: 'black' | 'white' | 'whiteOutline';
}

/**
 * <ApplePay /> — renders an Apple Pay button that triggers the native
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

    try {
      const resultJson = await NativeApplePay.requestPayment(
        JSON.stringify(config),
        bolt.publishableKey,
        bolt.baseUrl
      );
      const result: ApplePayResult = JSON.parse(resultJson);
      onComplete(result);
    } catch (err) {
      onError?.(
        err instanceof Error ? err : new Error('Apple Pay payment failed')
      );
    }
  }, [config, bolt, onComplete, onError]);

  if (!available) {
    return null;
  }

  const buttonColors = {
    black: { bg: '#000000', text: '#FFFFFF' },
    white: { bg: '#FFFFFF', text: '#000000' },
    whiteOutline: { bg: '#FFFFFF', text: '#000000' },
  };
  const colors = buttonColors[buttonStyle];

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: colors.bg },
        buttonStyle === 'whiteOutline' && styles.outline,
        style,
      ]}
      onPress={handlePress}
      accessibilityLabel="Pay with Apple Pay"
      accessibilityRole="button"
    >
      <Text style={[styles.buttonText, { color: colors.text }]}>
        {'\uF8FF'} Pay
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  outline: {
    borderWidth: 1,
    borderColor: '#000000',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600',
  },
});
