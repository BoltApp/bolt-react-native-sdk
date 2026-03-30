import type {
  ApplePayConfig,
  ApplePayResult,
  GooglePayConfig,
  GooglePayResult,
} from '../payments/types';

/**
 * Tests for wallet type definitions.
 * Ensures the types match what the native modules return,
 * particularly the billing contact fields needed for Bolt account creation.
 */
describe('ApplePay types', () => {
  it('ApplePayResult should include billingContact with email and phone', () => {
    const result: ApplePayResult = {
      token: 'tok_apple_123',
      billingContact: {
        givenName: 'Jane',
        familyName: 'Doe',
        emailAddress: 'jane@example.com',
        phoneNumber: '+15551234567',
        postalAddress: {
          street: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94105',
          country: 'US',
        },
      },
      boltReference: 'bolt_ref_123',
    };

    expect(result.token).toBe('tok_apple_123');
    expect(result.billingContact?.emailAddress).toBe('jane@example.com');
    expect(result.billingContact?.phoneNumber).toBe('+15551234567');
    expect(result.billingContact?.givenName).toBe('Jane');
    expect(result.billingContact?.familyName).toBe('Doe');
    expect(result.billingContact?.postalAddress?.postalCode).toBe('94105');
  });

  it('ApplePayResult should allow optional billingContact fields', () => {
    const result: ApplePayResult = {
      token: 'tok_apple_minimal',
    };

    expect(result.token).toBe('tok_apple_minimal');
    expect(result.billingContact).toBeUndefined();
    expect(result.boltReference).toBeUndefined();
  });

  it('ApplePayConfig should require merchantId, countryCode, currencyCode, total', () => {
    const config: ApplePayConfig = {
      merchantId: 'merchant.com.bolt.example',
      countryCode: 'US',
      currencyCode: 'USD',
      total: { label: 'Card Verification', amount: '0.00' },
    };

    expect(config.merchantId).toBe('merchant.com.bolt.example');
    expect(config.total.amount).toBe('0.00');
  });
});

describe('GooglePay types', () => {
  it('GooglePayResult should include email, billingAddress with phoneNumber, and boltReference', () => {
    const result: GooglePayResult = {
      token: 'tok_google_123',
      email: 'jane@example.com',
      billingAddress: {
        name: 'Jane Doe',
        address1: '123 Main St',
        address2: '',
        locality: 'San Francisco',
        administrativeArea: 'CA',
        postalCode: '94105',
        countryCode: 'US',
        phoneNumber: '+15551234567',
      },
      boltReference: 'bolt_ref_google_456',
    };

    expect(result.token).toBe('tok_google_123');
    expect(result.email).toBe('jane@example.com');
    expect(result.billingAddress?.phoneNumber).toBe('+15551234567');
    expect(result.billingAddress?.name).toBe('Jane Doe');
    expect(result.billingAddress?.postalCode).toBe('94105');
    expect(result.boltReference).toBe('bolt_ref_google_456');
  });

  it('GooglePayResult should allow optional email, billingAddress, and boltReference', () => {
    const result: GooglePayResult = {
      token: 'tok_google_minimal',
    };

    expect(result.token).toBe('tok_google_minimal');
    expect(result.email).toBeUndefined();
    expect(result.billingAddress).toBeUndefined();
    expect(result.boltReference).toBeUndefined();
  });

  it('GooglePayConfig should require gatewayMerchantId, merchantName, countryCode, currencyCode, totalPrice', () => {
    const config: GooglePayConfig = {
      gatewayMerchantId: 'BOLT_MERCHANT_ID',
      googleMerchantId: 'BCR2DN6T7654321',
      merchantName: 'Demo Store',
      countryCode: 'US',
      currencyCode: 'USD',
      totalPrice: '0.00',
      totalPriceStatus: 'ESTIMATED',
    };

    expect(config.gatewayMerchantId).toBe('BOLT_MERCHANT_ID');
    expect(config.googleMerchantId).toBe('BCR2DN6T7654321');
    expect(config.totalPrice).toBe('0.00');
    expect(config.totalPriceStatus).toBe('ESTIMATED');
  });
});
