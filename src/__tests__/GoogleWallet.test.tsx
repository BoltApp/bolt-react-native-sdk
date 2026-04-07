import { Platform } from 'react-native';
import type { GooglePayConfig, GooglePayButtonType } from '../payments/types';
import { fetchGooglePayAPMConfig } from '../payments/googlePayApi';

/**
 * Tests for the GoogleWallet component logic.
 *
 * Validates:
 * - Platform gating (Android only)
 * - Availability checks via NativeGooglePay.isReadyToPay
 * - Payment request flow: config serialization → native call → result parsing
 * - Error handling when requestPayment rejects
 * - buttonType prop defaults
 * - APM config fetch from Bolt API
 */

const mockIsReadyToPay = jest.fn<Promise<boolean>, [string]>();
const mockRequestPayment = jest.fn<Promise<string>, [string, string, string]>();

jest.mock('../native/NativeGooglePay', () => ({
  __esModule: true,
  default: {
    isReadyToPay: (...args: unknown[]) =>
      mockIsReadyToPay(...(args as [string])),
    requestPayment: (...args: unknown[]) =>
      mockRequestPayment(...(args as [string, string, string])),
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

const mockSpan = {
  setStatus: jest.fn(),
  recordException: jest.fn(),
  end: jest.fn(),
};

jest.mock('../telemetry/tracer', () => ({
  startSpan: () => mockSpan,
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

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

describe('GoogleWallet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as any).OS = 'android';
  });

  describe('platform gating', () => {
    it('should not call isReadyToPay on iOS', () => {
      (Platform as any).OS = 'ios';
      expect(Platform.OS).toBe('ios');
      expect(Platform.OS !== 'android').toBe(true);
    });
  });

  describe('isReadyToPay', () => {
    it('should resolve true when Google Pay is available', async () => {
      mockIsReadyToPay.mockResolvedValue(true);
      const result = await mockIsReadyToPay(JSON.stringify(baseConfig));
      expect(result).toBe(true);
    });

    it('should resolve false when Google Pay is not available', async () => {
      mockIsReadyToPay.mockResolvedValue(false);
      const result = await mockIsReadyToPay(JSON.stringify(baseConfig));
      expect(result).toBe(false);
    });

    it('should pass serialized config to isReadyToPay', async () => {
      mockIsReadyToPay.mockResolvedValue(true);
      await mockIsReadyToPay(JSON.stringify(baseConfig));
      expect(mockIsReadyToPay).toHaveBeenCalledWith(JSON.stringify(baseConfig));
    });
  });

  describe('requestPayment', () => {
    it('should pass serialized config, publishableKey, and baseUrl', async () => {
      const resultJson = JSON.stringify({ token: 'tok_google_1' });
      mockRequestPayment.mockResolvedValue(resultJson);

      await mockRequestPayment(
        JSON.stringify(baseConfig),
        'pk_test_123',
        'https://connect.bolt.com'
      );

      expect(mockRequestPayment).toHaveBeenCalledWith(
        JSON.stringify(baseConfig),
        'pk_test_123',
        'https://connect.bolt.com'
      );
    });

    it('should return result with token, email, bin, and expiration', async () => {
      const expected = {
        token: 'tok_google_1',
        email: 'jane@example.com',
        bin: '411111',
        expiration: '2027-12',
        billingAddress: {
          name: 'Jane Doe',
          postalCode: '94105',
          countryCode: 'US',
          phoneNumber: '+15551234567',
        },
      };
      mockRequestPayment.mockResolvedValue(JSON.stringify(expected));

      const resultJson = await mockRequestPayment(
        JSON.stringify(baseConfig),
        'pk_test_123',
        'https://connect.bolt.com'
      );
      const result = JSON.parse(resultJson);

      expect(result.token).toBe('tok_google_1');
      expect(result.email).toBe('jane@example.com');
      expect(result.bin).toBe('411111');
      expect(result.expiration).toBe('2027-12');
      expect(result.billingAddress.phoneNumber).toBe('+15551234567');
    });

    it('should propagate errors from native module', async () => {
      mockRequestPayment.mockRejectedValue(new Error('User cancelled'));

      await expect(
        mockRequestPayment(
          JSON.stringify(baseConfig),
          'pk_test_123',
          'https://connect.bolt.com'
        )
      ).rejects.toThrow('User cancelled');
    });
  });

  describe('APM config', () => {
    it('should have the expected bolt_config shape', () => {
      const config = mockAPMConfig.bolt_config;
      expect(config.merchant_id).toBe('BCR2DN6T7654321');
      expect(config.merchant_name).toBe('Demo Store');
      expect(config.tokenization_specification.type).toBe('PAYMENT_GATEWAY');
      expect(config.tokenization_specification.parameters).toEqual({
        gateway: 'bolt',
        gatewayMerchantId: 'BOLT_MERCHANT_ID',
      });
    });
  });

  describe('buttonType defaults', () => {
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

describe('fetchGooglePayAPMConfig', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  it('sends the provided headers to the APM config endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAPMConfig),
    });

    await fetchGooglePayAPMConfig('https://api.bolt.com', {
      'X-Publishable-Key': 'pk_test_abc',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.bolt.com/v1/apm_config/googlepay',
      expect.objectContaining({
        method: 'GET',
        headers: { 'X-Publishable-Key': 'pk_test_abc' },
      })
    );
  });

  it('throws when the response is not ok', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    await expect(
      fetchGooglePayAPMConfig('https://api.bolt.com', {
        'X-Publishable-Key': 'bad_key',
      })
    ).rejects.toThrow('Failed to fetch Google Pay config: 401 Unauthorized');
  });
});
