import { useCallback, useEffect, useState } from 'react';
import { Platform, type ViewStyle } from 'react-native';
import { type IPostGooglePayTokenRequest } from '@boltpay/tokenizer';
import NativeGooglePay from '../native/NativeGooglePay';
import { useBolt } from '../client/useBolt';
import { useTkClient } from '../client/useTkClient';
import type {
  GooglePayResult,
  GooglePayConfig,
  GooglePayButtonType,
  GooglePayButtonTheme,
  GooglePayAPMConfigResponse,
  GooglePayAPMConfig,
  GooglePayBillingAddress,
} from './types';
import { recordEvent, startSpan, SpanStatusCode } from '../telemetry/tracer';
import { BoltAttributes } from '../telemetry/attributes';
import { logger } from '../telemetry/logger';
import { fetchGooglePayAPMConfig } from './googlePayApi';

export { fetchGooglePayAPMConfig };

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
  const [apmConfigResponse, setApmConfigResponse] =
    useState<GooglePayAPMConfigResponse | null>(null);

  const tkClient = useTkClient();

  // Fetch Bolt Google Pay config on mount
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    fetchGooglePayAPMConfig(bolt.apiUrl, bolt.apiHeaders())
      .then(setApmConfigResponse)
      .catch((err) => {
        onError?.(
          err instanceof Error
            ? err
            : new Error('Failed to fetch Google Pay config')
        );
      });
  }, [bolt, onError]);

  // Check Google Pay readiness once we have the APM config
  useEffect(() => {
    if (Platform.OS !== 'android' || !NativeGooglePay || !apmConfigResponse) {
      setAvailable(false);
      return;
    }

    const nativeConfig = buildNativeConfig(
      config,
      apmConfigResponse.bolt_config,
      bolt.environment
    );
    NativeGooglePay.isReadyToPay(JSON.stringify(nativeConfig))
      .then(setAvailable)
      .catch(() => setAvailable(false));
  }, [config, apmConfigResponse, bolt.environment]);

  const handlePress = useCallback(async () => {
    if (!NativeGooglePay || !apmConfigResponse) {
      onError?.(new Error('Google Pay is not available'));
      return;
    }

    recordEvent('bolt.google_pay.button_pressed', {
      [BoltAttributes.PAYMENT_METHOD]: 'google_pay',
      [BoltAttributes.PAYMENT_OPERATION]: 'button_pressed',
    });

    const span = startSpan('bolt.google_pay.request_payment', {
      [BoltAttributes.PAYMENT_METHOD]: 'google_pay',
      [BoltAttributes.PAYMENT_OPERATION]: 'request_payment',
    });

    // Keep onComplete OUT of the try/catch: a throwing consumer callback is
    // not an SDK payment failure and should not be routed to onError or logged
    // as a failed tokenization.
    let result: GooglePayResult | undefined;
    try {
      const nativeConfig = buildNativeConfig(
        config,
        apmConfigResponse.bolt_config,
        bolt.environment
      );
      const rawJson = await NativeGooglePay.requestPayment(
        JSON.stringify(nativeConfig)
      );
      const raw: {
        googlePayToken?: IPostGooglePayTokenRequest;
        billingAddress?: GooglePayBillingAddress;
        email?: string;
      } = JSON.parse(rawJson);

      if (!raw?.googlePayToken) {
        throw new Error('Native Google Pay response missing googlePayToken');
      }

      const tokenResult = await tkClient.postGooglePayToken(raw.googlePayToken);
      if (tokenResult instanceof Error) throw tokenResult;

      result = {
        token: tokenResult.token,
        bin: tokenResult.bin,
        expiration: tokenResult.expiry,
        last4: tokenResult.last4,
        network: tokenResult.network,
        email: raw.email,
        billingAddress: raw.billingAddress,
      };

      span.addEvent('bolt.google_pay.tokenize_success');
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Google Pay payment failed');
      // GooglePayModule.kt rejects with `code: 'CANCELLED'` on user dismissal
      // (and unfortunately also generic Google Pay errors; the native side
      // conflates them). Mirror the Apple Pay and WebView handling and treat
      // this code path as a silent cancel so merchants don't see a phantom
      // error for every dismissal.
      const nativeCode = (err as { code?: string }).code;
      if (nativeCode === 'CANCELLED') {
        span.addEvent('bolt.google_pay.cancelled', {
          [BoltAttributes.PAYMENT_CANCELLED]: true,
        });
        span.setStatus({ code: SpanStatusCode.UNSET });
        span.end();
        return;
      }

      span.addEvent('bolt.google_pay.tokenize_failure', {
        [BoltAttributes.ERROR_MESSAGE]: error.message,
      });
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.recordException(error);
      span.end();
      onError?.(error);
      return;
    }
    // Guard onComplete separately: a consumer throw is not a payment failure,
    // so don't route it to onError or surface as an unhandled rejection.
    try {
      onComplete(result);
    } catch (cbErr) {
      logger.error('google_pay.on_complete_threw', {
        error: cbErr instanceof Error ? cbErr.message : String(cbErr),
      });
    }
  }, [
    config,
    apmConfigResponse,
    bolt.environment,
    tkClient,
    onComplete,
    onError,
  ]);

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
  apmConfig: GooglePayAPMConfig,
  environment: 'production' | 'sandbox' | 'staging'
) => {
  return {
    // From Bolt API
    merchantId: apmConfig.merchant_id,
    merchantName: apmConfig.merchant_name,
    tokenizationSpecification: apmConfig.tokenization_specification,
    countryCode: 'US', //apmConfig.country_code ?? 'US', TODO: add country code to the config from API
    // From developer
    currencyCode: config.currencyCode ?? 'USD',
    totalPrice: config.amount ?? '0.00',
    totalPriceStatus: 'FINAL',
    totalPriceLabel: config.label,
    billingAddressFormat:
      config.billingAddressCollectionFormat === 'none' ? 'NONE' : 'FULL',
    // Tells the native module which Google Pay environment to use
    googlePayEnvironment: environment === 'production' ? 'PRODUCTION' : 'TEST',
  };
};
