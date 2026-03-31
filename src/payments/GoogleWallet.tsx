import { useCallback, useEffect, useState } from 'react';
import { Platform, type ViewStyle } from 'react-native';
import NativeGooglePay from '../native/NativeGooglePay';
import { useBolt } from '../client/useBolt';
import type {
  GooglePayResult,
  GooglePayConfig,
  GooglePayButtonType,
  GooglePayButtonTheme,
  GooglePayAPMConfigResponse,
  GooglePayAPMConfig,
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
  buttonTheme?: GooglePayButtonTheme;
  borderRadius?: number;
}

/**
 * Fetch Google Pay configuration from Bolt's API.
 * The config includes tokenization spec, merchant ID, and merchant name
 * so the developer doesn't need to provide them.
 */
const fetchGooglePayAPMConfig = async (
  apiUrl: string,
  publishableKey: string
): Promise<GooglePayAPMConfig> => {
  const response = await fetch(`${apiUrl}/v1/apm_config/googlepay`, {
    method: 'GET',
    headers: {
      merchant_token: publishableKey,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Google Pay config: ${response.status} ${response.statusText}`
    );
  }

  const data: GooglePayAPMConfigResponse = await response.json();
  return data.bolt_config;
};

/**
 * <GoogleWallet /> — renders a native Google Pay button that triggers the
 * native PaymentsClient payment sheet via the BoltGooglePay TurboModule.
 *
 * Merchant/gateway configuration is automatically fetched from Bolt's API
 * using the publishable key. Only renders on Android when Google Pay is available.
 */
export const GoogleWallet = ({
  config,
  onComplete,
  onError,
  style,
  buttonType = 'plain',
  buttonTheme,
  borderRadius,
}: GoogleWalletProps) => {
  const bolt = useBolt();
  const [available, setAvailable] = useState(false);
  const [apmConfig, setApmConfig] = useState<GooglePayAPMConfig | null>(null);

  // Fetch Bolt Google Pay config on mount
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    fetchGooglePayAPMConfig(bolt.apiUrl, bolt.publishableKey)
      .then(setApmConfig)
      .catch((err) => {
        onError?.(
          err instanceof Error
            ? err
            : new Error('Failed to fetch Google Pay config')
        );
      });
  }, [bolt.apiUrl, bolt.publishableKey, onError]);

  // Check Google Pay readiness once we have the APM config
  useEffect(() => {
    if (Platform.OS !== 'android' || !NativeGooglePay || !apmConfig) {
      setAvailable(false);
      return;
    }

    const nativeConfig = buildNativeConfig(config, apmConfig);
    NativeGooglePay.isReadyToPay(JSON.stringify(nativeConfig))
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, [config, apmConfig]);

  const handlePress = useCallback(async () => {
    if (!NativeGooglePay || !apmConfig) {
      onError?.(new Error('Google Pay is not available'));
      return;
    }

    const span = startSpan('bolt.google_pay.request_payment', {
      [BoltAttributes.PAYMENT_METHOD]: 'google_pay',
      [BoltAttributes.PAYMENT_OPERATION]: 'request_payment',
    });

    try {
      const nativeConfig = buildNativeConfig(config, apmConfig);
      const resultJson = await NativeGooglePay.requestPayment(
        JSON.stringify(nativeConfig),
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
  }, [config, apmConfig, bolt, onComplete, onError]);

  if (!available || !BoltGooglePayButton) {
    return null;
  }

  return (
    <BoltGooglePayButton
      buttonType={buttonType}
      buttonTheme={buttonTheme}
      borderRadius={borderRadius}
      // eslint-disable-next-line react-native/no-inline-styles
      style={[{ height: 48 }, style]}
      onPress={handlePress}
    />
  );
};

/**
 * Build the config object sent to the native module by merging
 * the Bolt API config with the developer's presentation options.
 */
const buildNativeConfig = (
  config: GooglePayConfig,
  apmConfig: GooglePayAPMConfig
) => {
  return {
    // From Bolt API
    merchantId: apmConfig.merchant_id,
    merchantName: apmConfig.merchant_name,
    tokenizationSpecification: apmConfig.tokenization_specification,
    // From developer
    currencyCode: config.currencyCode ?? 'USD',
    totalPrice: config.amount ?? '0.00',
    totalPriceStatus: 'FINAL',
    totalPriceLabel: config.label,
    billingAddressFormat:
      config.billingAddressCollectionFormat === 'none' ? 'NONE' : 'FULL',
  };
};
