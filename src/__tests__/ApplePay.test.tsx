import { Platform } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApplePay } from '../payments/ApplePay';
import type { ApplePayConfig, ApplePayButtonType } from '../payments/types';

/**
 * Tests for the ApplePay component in `mode='native'`.
 *
 * Validates the native-mode handler flow:
 *   onPress → NativeApplePay.requestPayment(config)
 *         → tkClient.postApplePayToken(raw.applePayToken)
 *         → onComplete(mapped result)
 *         → NativeApplePay.reportAuthorizationResult(success, errorMessage)
 * plus error branches (tokenizer returns Error, native response missing token).
 *
 * Default `mode='webview'` is exercised by `ApplePayWebView.test.tsx`.
 */

const mockCanMakePayments = jest.fn<Promise<boolean>, []>();
const mockRequestPayment = jest.fn<Promise<string>, [string]>();
const mockReportAuthorizationResult = jest.fn<
  Promise<void>,
  [boolean, string | null]
>();

jest.mock('../native/NativeApplePay', () => ({
  __esModule: true,
  default: {
    canMakePayments: (...args: unknown[]) =>
      mockCanMakePayments(...(args as [])),
    requestPayment: (...args: unknown[]) =>
      mockRequestPayment(...(args as [string])),
    reportAuthorizationResult: (...args: unknown[]) =>
      mockReportAuthorizationResult(...(args as [boolean, string | null])),
  },
}));

jest.mock('../native/NativeApplePayButton', () => ({
  __esModule: true,
  default: 'BoltApplePayButton',
}));

// ApplePay.tsx transitively imports ApplePayWebView (for `mode='webview'`)
// which imports react-native-webview — an ESM module Jest can't transform by
// default. Stub it since these tests only cover `mode='native'`.
jest.mock('react-native-webview', () => ({
  __esModule: true,
  default: 'WebView',
}));

const mockPostApplePayToken = jest.fn();
jest.mock('../client/useTkClient', () => ({
  useTkClient: () => ({
    postApplePayToken: mockPostApplePayToken,
  }),
}));

const mockSpan = {
  setStatus: jest.fn(),
  recordException: jest.fn(),
  end: jest.fn(),
};

jest.mock('../telemetry/tracer', () => ({
  startSpan: () => mockSpan,
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

const baseConfig: ApplePayConfig = {
  merchantId: 'merchant.com.bolt.example',
  countryCode: 'US',
  currencyCode: 'USD',
  total: { label: 'Test', amount: '10.00' },
};

const rawNativeResponse = {
  applePayToken: {
    paymentData: {
      data: 'enc',
      signature: 'sig',
      header: {
        publicKeyHash: 'h',
        ephemeralPublicKey: 'e',
        transactionId: 'tx',
      },
      version: 'EC_v1',
    },
    paymentMethod: {
      displayName: 'Visa ****',
      network: 'Visa',
      type: 'debit',
    },
    transactionIdentifier: 'tx_123',
  },
  billingContact: {
    givenName: 'Jane',
    familyName: 'Doe',
    emailAddress: 'jane@example.com',
  },
};

const renderNative = async (
  overrides: {
    onComplete?: jest.Mock;
    onError?: jest.Mock;
  } = {}
) => {
  const onComplete = overrides.onComplete ?? jest.fn();
  const onError = overrides.onError ?? jest.fn();
  const utils = render(
    <ApplePay
      mode="native"
      config={baseConfig}
      onComplete={onComplete}
      onError={onError}
    />
  );
  // The native-mode effect probes canMakePayments before rendering the
  // PKPaymentButton. Wait for that promise to resolve and the button to mount.
  const button = await waitFor(() =>
    utils.UNSAFE_root.findByType(
      'BoltApplePayButton' as unknown as React.ComponentType
    )
  );
  return { ...utils, onComplete, onError, button };
};

describe('ApplePay (native mode)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'ios';
    mockCanMakePayments.mockResolvedValue(true);
    mockReportAuthorizationResult.mockResolvedValue(undefined);
  });

  it('tokenizes via tkClient and resolves onComplete with the mapped result', async () => {
    mockRequestPayment.mockResolvedValue(JSON.stringify(rawNativeResponse));
    mockPostApplePayToken.mockResolvedValue({
      token: 'bolt_tok_abc',
      bin: '411111',
      expiry: '2027-12',
      last4: '1234',
      network: 'visa',
    });

    const { button, onComplete, onError } = await renderNative();
    fireEvent(button, 'press');

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(mockRequestPayment).toHaveBeenCalledWith(JSON.stringify(baseConfig));
    expect(mockPostApplePayToken).toHaveBeenCalledWith(
      rawNativeResponse.applePayToken
    );
    expect(onComplete).toHaveBeenCalledWith({
      token: 'bolt_tok_abc',
      bin: '411111',
      expiration: '2027-12',
      billingContact: rawNativeResponse.billingContact,
    });
    expect(onError).not.toHaveBeenCalled();
    expect(mockReportAuthorizationResult).toHaveBeenCalledWith(true, null);
  });

  it('calls onError and reportAuthorizationResult(false) when tkClient returns an Error', async () => {
    mockRequestPayment.mockResolvedValue(JSON.stringify(rawNativeResponse));
    const tokenizeError = new Error('Bad http response: 400');
    mockPostApplePayToken.mockResolvedValue(tokenizeError);

    const { button, onComplete, onError } = await renderNative();
    fireEvent(button, 'press');

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith(tokenizeError);
    expect(onComplete).not.toHaveBeenCalled();
    expect(mockReportAuthorizationResult).toHaveBeenCalledWith(
      false,
      'Bad http response: 400'
    );
    expect(mockSpan.recordException).toHaveBeenCalledWith(tokenizeError);
  });

  it('rejects when native response is missing applePayToken', async () => {
    mockRequestPayment.mockResolvedValue(
      JSON.stringify({ billingContact: {} })
    );

    const { button, onComplete, onError } = await renderNative();
    fireEvent(button, 'press');

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(mockPostApplePayToken).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toMatch(/missing applePayToken/);
    // Authorization was reached (requestPayment resolved) so report still fires.
    expect(mockReportAuthorizationResult).toHaveBeenCalledWith(
      false,
      expect.stringMatching(/missing applePayToken/)
    );
  });

  it('propagates rejections from requestPayment without calling report', async () => {
    mockRequestPayment.mockRejectedValue(new Error('User cancelled'));

    const { button, onComplete, onError } = await renderNative();
    fireEvent(button, 'press');

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0].message).toBe('User cancelled');
    expect(onComplete).not.toHaveBeenCalled();
    // Authorization was never reached — sheet is already dismissed by PassKit,
    // so there's nothing to report back to native.
    expect(mockReportAuthorizationResult).not.toHaveBeenCalled();
  });

  describe('buttonType type-level validity', () => {
    it('should accept all valid ApplePayButtonType values', () => {
      const validTypes: ApplePayButtonType[] = [
        'plain',
        'buy',
        'setUp',
        'inStore',
        'donate',
        'checkout',
        'book',
        'subscribe',
        'reload',
        'addMoney',
        'topUp',
        'order',
        'rent',
        'support',
        'contribute',
        'tip',
      ];

      for (const t of validTypes) {
        const typed: ApplePayButtonType = t;
        expect(typed).toBe(t);
      }
    });
  });
});
