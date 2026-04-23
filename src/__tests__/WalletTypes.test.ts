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
  it('ApplePayResult should include billingContact, bin, and expiration', () => {
    const result: ApplePayResult = {
      token: 'tok_apple_123',
      bin: '411111',
      expiration: '2027-12',
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
    };

    expect(result.token).toBe('tok_apple_123');
    expect(result.bin).toBe('411111');
    expect(result.expiration).toBe('2027-12');
    expect(result.billingContact?.emailAddress).toBe('jane@example.com');
    expect(result.billingContact?.phoneNumber).toBe('+15551234567');
    expect(result.billingContact?.givenName).toBe('Jane');
    expect(result.billingContact?.familyName).toBe('Doe');
    expect(result.billingContact?.postalAddress?.postalCode).toBe('94105');
  });

  it('ApplePayResult should allow optional fields', () => {
    const result: ApplePayResult = {
      token: 'tok_apple_minimal',
    };

    expect(result.token).toBe('tok_apple_minimal');
    expect(result.billingContact).toBeUndefined();
    expect(result.bin).toBeUndefined();
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
  it('GooglePayResult should include email, billingAddress with phoneNumber, bin, last4, and expiration', () => {
    const result: GooglePayResult = {
      token: 'tok_google_123',
      bin: '411111',
      last4: '1234',
      expiration: '2026-12',
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
    };

    expect(result.token).toBe('tok_google_123');
    expect(result.bin).toBe('411111');
    expect(result.last4).toBe('1234');
    expect(result.email).toBe('jane@example.com');
    expect(result.billingAddress?.phoneNumber).toBe('+15551234567');
    expect(result.billingAddress?.name).toBe('Jane Doe');
    expect(result.billingAddress?.postalCode).toBe('94105');
  });

  it('GooglePayResult should allow optional fields', () => {
    const result: GooglePayResult = {
      token: 'tok_google_minimal',
    };

    expect(result.token).toBe('tok_google_minimal');
    expect(result.email).toBeUndefined();
    expect(result.billingAddress).toBeUndefined();
    expect(result.last4).toBeUndefined();
  });

  it('GooglePayConfig should accept presentation options only', () => {
    const config: GooglePayConfig = {
      currencyCode: 'USD',
      amount: '0.00',
      label: 'Card Verification',
      billingAddressCollectionFormat: 'full',
    };

    expect(config.currencyCode).toBe('USD');
    expect(config.amount).toBe('0.00');
    expect(config.label).toBe('Card Verification');
    expect(config.billingAddressCollectionFormat).toBe('full');
  });

  it('GooglePayConfig should allow all fields to be optional', () => {
    const config: GooglePayConfig = {};

    expect(config.currencyCode).toBeUndefined();
    expect(config.amount).toBeUndefined();
    expect(config.label).toBeUndefined();
    expect(config.billingAddressCollectionFormat).toBeUndefined();
  });
});
