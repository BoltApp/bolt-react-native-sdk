import { Platform } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { GooglePayConfig, GooglePayButtonType } from '../payments/types';

// GoogleWallet.tsx gates its BoltGooglePayButton require on `Platform.OS === 'android'`
// at module load. Default Jest platform is 'ios', so flip Platform.OS first and
// lazy-require the SUT after to ensure the native button component resolves.
(Platform as any).OS = 'android';

const mockFetchAPMConfig = jest.fn<
  Promise<unknown>,
  [string, Record<string, string>]
>();
jest.mock('../payments/googlePayApi', () => ({
  fetchGooglePayAPMConfig: (...args: unknown[]) =>
    mockFetchAPMConfig(...(args as [string, Record<string, string>])),
}));

const mockIsReadyToPay = jest.fn<Promise<boolean>, [string]>();
const mockRequestPayment = jest.fn<Promise<string>, [string]>();

jest.mock('../native/NativeGooglePay', () => ({
  __esModule: true,
  default: {
    isReadyToPay: (...args: unknown[]) =>
      mockIsReadyToPay(...(args as [string])),
    requestPayment: (...args: unknown[]) =>
      mockRequestPayment(...(args as [string])),
  },
}));

jest.mock('../native/NativeGooglePayButton', () => ({
  __esModule: true,
  default: 'BoltGooglePayButton',
}));

jest.mock('../client/useBolt', () => ({
  useBolt: () => ({
    publishableKey: 'pk_test_123',
    environment: 'production' as const,
    baseUrl: 'https://connect.bolt.com',
    apiUrl: 'https://api.bolt.com',
    apiHeaders: () => ({ 'X-Publishable-Key': 'pk_test_123' }),
  }),
}));

const mockPostGooglePayToken = jest.fn();
jest.mock('../client/useTkClient', () => ({
  useTkClient: () => ({
    postGooglePayToken: mockPostGooglePayToken,
  }),
}));

const mockSpan = {
  setStatus: jest.fn(),
  recordException: jest.fn(),
  addEvent: jest.fn(),
  end: jest.fn(),
};

const mockStartSpan = jest.fn<
  typeof mockSpan,
  [string, Record<string, unknown>?]
>(() => mockSpan);
const mockRecordEvent = jest.fn<void, [string, Record<string, unknown>?]>();

jest.mock('../telemetry/tracer', () => ({
  startSpan: (name: string, attrs?: Record<string, unknown>) =>
    mockStartSpan(name, attrs),
  recordEvent: (name: string, attrs?: Record<string, unknown>) =>
    mockRecordEvent(name, attrs),
  SpanStatusCode: { OK: 1, ERROR: 2, UNSET: 0 },
}));

// Require the Android-platform source explicitly. Jest's haste is configured
// with `defaultPlatform: 'ios'`, which resolves `../payments/GoogleWallet` to
// the `GoogleWallet.ios.tsx` stub (`() => null`). That stub exists for Metro on
// iOS builds, but these tests exercise the real Android behavior.

const { GoogleWallet } =
  require('../payments/GoogleWallet.tsx') as typeof import('../payments/GoogleWallet');

/**
 * Tests for the GoogleWallet component.
 *
 * Validates the native-mode handler flow:
 *   onPress → NativeGooglePay.requestPayment → tkClient.postGooglePayToken
 *         → onComplete(mapped result)
 * plus the error branches: tkClient returns Error, native response missing
 * token, and user-cancelled requestPayment rejection.
 *
 * Network-boundary tests for `fetchGooglePayAPMConfig` live in
 * `googlePayApi.test.ts`.
 */

const baseConfig: GooglePayConfig = {
  currencyCode: 'USD',
  amount: '10.00',
  label: 'Test Purchase',
  billingAddressCollectionFormat: 'full',
};

const mockAPMConfig = {
  bolt_config: {
    credit_card_processor: 'bolt',
    tokenization_specification: {
      type: 'PAYMENT_GATEWAY',
      parameters: {
        gateway: 'bolt',
        gatewayMerchantId: 'BOLT_MERCHANT_ID',
      },
    },
    merchant_id: 'BCR2DN6T7654321',
    merchant_name: 'Demo Store',
  },
};

const rawNativeResponse = {
  googlePayToken: {
    intermediateSigningKey: {
      signedKey: 'sk',
      signatures: ['s1'],
    },
    signature: 'top-sig',
    signedMessage: 'msg',
    protocolVersion: 'ECv2',
  },
  billingAddress: {
    name: 'Jane Doe',
    postalCode: '94105',
    countryCode: 'US',
    phoneNumber: '+15551234567',
  },
  email: 'jane@example.com',
};

const renderWallet = async (
  overrides: { onComplete?: jest.Mock; onError?: jest.Mock } = {}
) => {
  const onComplete = overrides.onComplete ?? jest.fn();
  const onError = overrides.onError ?? jest.fn();
  const utils = render(
    <GoogleWallet
      config={baseConfig}
      onComplete={onComplete}
      onError={onError}
    />
  );
  // Two async effects must settle before the button renders:
  //   1) fetchGooglePayAPMConfig (mocked)
  //   2) NativeGooglePay.isReadyToPay (mocked)
  const button = await waitFor(() =>
    utils.UNSAFE_root.findByType(
      'BoltGooglePayButton' as unknown as React.ComponentType
    )
  );
  return { ...utils, onComplete, onError, button };
};

describe('GoogleWallet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'android';
    mockFetchAPMConfig.mockResolvedValue(mockAPMConfig);
    mockIsReadyToPay.mockResolvedValue(true);
  });

  it('tokenizes via tkClient and resolves onComplete with the mapped result', async () => {
    mockRequestPayment.mockResolvedValue(JSON.stringify(rawNativeResponse));
    mockPostGooglePayToken.mockResolvedValue({
      token: 'bolt_tok_gp',
      bin: '411111',
      expiry: '2027-12',
      last4: '1234',
      network: 'visa',
    });

    const { button, onComplete, onError } = await renderWallet();
    fireEvent(button, 'press');

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(mockPostGooglePayToken).toHaveBeenCalledWith(
      rawNativeResponse.googlePayToken
    );
    expect(onComplete).toHaveBeenCalledWith({
      token: 'bolt_tok_gp',
      bin: '411111',
      expiration: '2027-12',
      last4: '1234',
      network: 'visa',
      email: 'jane@example.com',
      billingAddress: rawNativeResponse.billingAddress,
    });
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError when tkClient returns an Error', async () => {
    mockRequestPayment.mockResolvedValue(JSON.stringify(rawNativeResponse));
    const tokenizeError = new Error('Bad http response: 400');
    mockPostGooglePayToken.mockResolvedValue(tokenizeError);

    const { button, onComplete, onError } = await renderWallet();
    fireEvent(button, 'press');

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith(tokenizeError);
    expect(onComplete).not.toHaveBeenCalled();
    expect(mockSpan.recordException).toHaveBeenCalledWith(tokenizeError);
  });

  it('rejects when native response is missing googlePayToken', async () => {
    mockRequestPayment.mockResolvedValue(JSON.stringify({ email: 'x@y.z' }));

    const { button, onComplete, onError } = await renderWallet();
    fireEvent(button, 'press');

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(mockPostGooglePayToken).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(onError.mock.calls[0][0].message).toMatch(/missing googlePayToken/);
  });

  it('propagates non-CANCELLED native rejections through onError', async () => {
    // A rejection without `code: 'CANCELLED'` — generic native failure.
    mockRequestPayment.mockRejectedValue(new Error('Native bridge error'));

    const { button, onComplete, onError } = await renderWallet();
    fireEvent(button, 'press');

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError.mock.calls[0][0].message).toBe('Native bridge error');
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('treats native CANCELLED code as a silent cancel (no onError)', async () => {
    // GooglePayModule.kt rejects with code 'CANCELLED' on user dismissal.
    // Consumers should not see this as an error.
    const cancelErr = Object.assign(
      new Error('Google Pay was cancelled or failed'),
      { code: 'CANCELLED' }
    );
    mockRequestPayment.mockRejectedValue(cancelErr);

    const { button, onComplete, onError } = await renderWallet();
    fireEvent(button, 'press');

    await waitFor(() =>
      expect(mockSpan.addEvent).toHaveBeenCalledWith(
        'bolt.google_pay.cancelled',
        expect.objectContaining({ 'payment.cancelled': true })
      )
    );
    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(mockPostGooglePayToken).not.toHaveBeenCalled();
  });

  it('records a button_pressed event and a request_payment parent span', async () => {
    mockRequestPayment.mockResolvedValue(JSON.stringify(rawNativeResponse));
    mockPostGooglePayToken.mockResolvedValue({
      token: 'bolt_tok',
      bin: '411111',
      expiry: '2027-12',
      last4: '1234',
      network: 'visa',
    });

    const { button } = await renderWallet();
    fireEvent(button, 'press');

    await waitFor(() =>
      expect(mockRecordEvent).toHaveBeenCalledWith(
        'bolt.google_pay.button_pressed',
        expect.any(Object)
      )
    );
    expect(mockStartSpan).toHaveBeenCalledWith(
      'bolt.google_pay.request_payment',
      expect.any(Object)
    );
    await waitFor(() =>
      expect(mockSpan.addEvent).toHaveBeenCalledWith(
        'bolt.google_pay.tokenize_success'
      )
    );
  });

  it('does not render the button when isReadyToPay resolves false', async () => {
    mockIsReadyToPay.mockResolvedValue(false);

    const onComplete = jest.fn();
    const onError = jest.fn();
    const utils = render(
      <GoogleWallet
        config={baseConfig}
        onComplete={onComplete}
        onError={onError}
      />
    );
    // Let both mounting effects settle — isReadyToPay resolving false means
    // `available` stays false, so the button should never appear.
    await waitFor(() => expect(mockIsReadyToPay).toHaveBeenCalled());
    expect(
      utils.UNSAFE_root.findAllByType(
        'BoltGooglePayButton' as unknown as React.ComponentType
      )
    ).toHaveLength(0);
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError when the APM config fetch fails', async () => {
    const fetchError = new Error(
      'Failed to fetch Google Pay config: 401 Unauthorized'
    );
    mockFetchAPMConfig.mockRejectedValue(fetchError);

    const onComplete = jest.fn();
    const onError = jest.fn();
    const utils = render(
      <GoogleWallet
        config={baseConfig}
        onComplete={onComplete}
        onError={onError}
      />
    );
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith(fetchError);
    expect(onComplete).not.toHaveBeenCalled();
    // Without APM config, isReadyToPay is never called and the button stays hidden.
    expect(mockIsReadyToPay).not.toHaveBeenCalled();
    expect(
      utils.UNSAFE_root.findAllByType(
        'BoltGooglePayButton' as unknown as React.ComponentType
      )
    ).toHaveLength(0);
  });

  describe('buttonType type-level validity', () => {
    it('should accept all valid GooglePayButtonType values', () => {
      const validTypes: GooglePayButtonType[] = [
        'plain',
        'buy',
        'pay',
        'checkout',
        'subscribe',
        'donate',
        'order',
        'book',
      ];

      for (const t of validTypes) {
        const typed: GooglePayButtonType = t;
        expect(typed).toBe(t);
      }
    });
  });
});
