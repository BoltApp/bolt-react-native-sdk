import { renderHook } from '@testing-library/react-hooks';

/**
 * Tests for useTkClient: the module-level cache should yield the same TkClient
 * instance for repeated calls with the same environment, avoiding redundant
 * public-key fetches and keypair generations when both wallet components mount.
 *
 * Each test isolates the module graph with `jest.isolateModules` so the
 * module-level `clientCache` starts empty per test — call-count assertions
 * would otherwise depend on execution order across tests.
 */

const mockTkClientCtor = jest.fn();
jest.mock('@boltpay/tokenizer', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation((env: string) => {
      mockTkClientCtor(env);
      return {
        env,
        isPublicKeySet: () => Promise.resolve(true),
      };
    }),
  };
});

const mockUseBolt = jest.fn();
jest.mock('../client/useBolt', () => ({
  useBolt: () => mockUseBolt(),
}));

const withFreshUseTkClient = (fn: (useTkClient: () => unknown) => void) => {
  jest.isolateModules(() => {
    const mod = require('../client/useTkClient');
    fn(mod.useTkClient);
  });
};

describe('useTkClient', () => {
  beforeEach(() => {
    mockTkClientCtor.mockClear();
  });

  it('returns the same TkClient instance for repeated calls in the same environment', () => {
    mockUseBolt.mockReturnValue({ environment: 'sandbox' });

    withFreshUseTkClient((useTkClient) => {
      const { result: first } = renderHook(() => useTkClient());
      const { result: second } = renderHook(() => useTkClient());
      const { result: third } = renderHook(() => useTkClient());

      expect(first.current).toBe(second.current);
      expect(second.current).toBe(third.current);
      // The module-level cache — not useMemo — is what makes this stable:
      // useMemo alone would produce a fresh TkClient per renderHook mount.
      expect(mockTkClientCtor).toHaveBeenCalledTimes(1);
      expect(mockTkClientCtor).toHaveBeenCalledWith('sandbox');
    });
  });

  it('creates a fresh TkClient for a different environment', () => {
    withFreshUseTkClient((useTkClient) => {
      mockUseBolt.mockReturnValueOnce({ environment: 'production' });
      const { result: prod } = renderHook(() => useTkClient());

      mockUseBolt.mockReturnValueOnce({ environment: 'staging' });
      const { result: staging } = renderHook(() => useTkClient());

      expect(prod.current).not.toBe(staging.current);
      expect(mockTkClientCtor).toHaveBeenCalledTimes(2);
      expect(mockTkClientCtor).toHaveBeenCalledWith('production');
      expect(mockTkClientCtor).toHaveBeenCalledWith('staging');
    });
  });

  it('evicts a TkClient whose public-key fetch failed so the next call constructs fresh', async () => {
    jest.resetModules();
    // One-off mock: isPublicKeySet resolves false, simulating a failed public
    // key fetch during TkClient construction.
    jest.doMock('@boltpay/tokenizer', () => ({
      __esModule: true,
      default: jest.fn().mockImplementation((env: string) => {
        mockTkClientCtor(env);
        return {
          env,
          isPublicKeySet: () => Promise.resolve(false),
        };
      }),
    }));

    mockUseBolt.mockReturnValue({ environment: 'production' });

    let useTkClient: () => unknown;
    jest.isolateModules(() => {
      useTkClient = require('../client/useTkClient').useTkClient;
    });
    const { result: first } = renderHook(() => useTkClient());
    const broken = first.current;

    // Let the eviction callback (attached after construction) settle.
    await new Promise((r) => setTimeout(r, 0));

    const { result: second } = renderHook(() => useTkClient());
    // Cache was evicted, so the second call constructs a fresh client.
    expect(second.current).not.toBe(broken);
    expect(mockTkClientCtor).toHaveBeenCalledTimes(2);

    jest.dontMock('@boltpay/tokenizer');
  });
});
