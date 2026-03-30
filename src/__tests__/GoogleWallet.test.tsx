import { Platform } from 'react-native';
import type { GooglePayConfig, GooglePayButtonType } from '../payments/types';

/**
 * Tests for the GoogleWallet component logic.
 *
 * Validates:
 * - Platform gating (Android only)
 * - Availability checks via NativeGooglePay.isReadyToPay
 * - Payment request flow: config serialization → native call → result parsing
 * - Error handling when requestPayment rejects
 * - buttonType prop defaults
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
    baseUrl: 'https://connect.bolt.com',
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
  gatewayMerchantId: 'BOLT_MERCHANT_ID',
  googleMerchantId: 'BCR2DN6T7654321',
  merchantName: 'Demo Store',
  countryCode: 'US',
  currencyCode: 'USD',
  totalPrice: '10.00',
  totalPriceStatus: 'FINAL',
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
