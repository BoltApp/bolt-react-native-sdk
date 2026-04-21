import { fetchGooglePayAPMConfig } from '../payments/googlePayApi';

/**
 * Network-boundary tests for fetchGooglePayAPMConfig.
 * Extracted from GoogleWallet tests — those mock this module so the real
 * implementation's URL/header/error handling needs its own coverage here.
 */

const mockAPMConfig = {
  bolt_config: {
    credit_card_processor: 'bolt',
    tokenization_specification: {
      type: 'PAYMENT_GATEWAY',
      parameters: { gateway: 'bolt', gatewayMerchantId: 'BOLT_MERCHANT_ID' },
    },
    merchant_id: 'BCR2DN6T7654321',
    merchant_name: 'Demo Store',
  },
};

describe('fetchGooglePayAPMConfig', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    (global as any).fetch = mockFetch;
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
