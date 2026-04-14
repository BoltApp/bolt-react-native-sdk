import { renderHook, act } from '@testing-library/react-hooks';

/**
 * Tests for useNativeCreditCardController hook.
 *
 * Validates:
 * - Controller returns expected interface (on, tokenize, setStyles, nativeRef)
 * - Event listener registration via on()
 * - tokenize() calls the native module with correct args
 * - tokenize() parses successful TokenResult from JSON
 * - tokenize() returns Error on native module failure
 * - tokenize() returns Error when view is not mounted
 * - tokenize() returns Error when native module is unavailable
 * - setStyles() does not throw
 */

const mockTokenize = jest.fn<Promise<string>, [number, string, string]>();

jest.mock('../native/NativeBoltCardFieldModule', () => ({
  __esModule: true,
  default: {
    tokenize: (...args: unknown[]) =>
      mockTokenize(...(args as [number, string, string])),
  },
}));

jest.mock('../client/useBolt', () => ({
  useBolt: () => ({
    publishableKey: 'pk_test_123',
    baseUrl: 'https://connect.bolt.com',
    apiUrl: 'https://api-staging.bolt.com',
  }),
}));

import { useNativeCreditCardController } from '../payments/useNativeCreditCardController';
import { findNodeHandle } from 'react-native';

// Override findNodeHandle after import
jest
  .spyOn(
    require('react-native') as typeof import('react-native'),
    'findNodeHandle'
  )
  .mockReturnValue(42);

describe('useNativeCreditCardController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore findNodeHandle to return a valid tag
    (findNodeHandle as unknown as jest.Mock).mockReturnValue(42);
  });

  it('should return controller with expected interface', () => {
    const { result } = renderHook(() => useNativeCreditCardController());
    const controller = result.current;

    expect(controller.on).toBeDefined();
    expect(controller.tokenize).toBeDefined();
    expect(controller.setStyles).toBeDefined();
    expect(controller.nativeRef).toBeDefined();
    expect(controller._listenersRef).toBeDefined();
    expect(typeof controller.on).toBe('function');
    expect(typeof controller.tokenize).toBe('function');
    expect(typeof controller.setStyles).toBe('function');
  });

  it('should register event listeners via on()', () => {
    const { result } = renderHook(() => useNativeCreditCardController());
    const validCb = jest.fn();
    const errorCb = jest.fn();

    act(() => {
      result.current.on('valid', validCb);
      result.current.on('error', errorCb);
    });

    expect(result.current._listenersRef.current.valid).toBe(validCb);
    expect(result.current._listenersRef.current.error).toBe(errorCb);
  });

  it('should call native module tokenize with correct args', async () => {
    mockTokenize.mockResolvedValue(
      JSON.stringify({
        token: 'bolt_cc_test123',
        last4: '4242',
        bin: '424242',
        network: 'visa',
        expiration: '2028-12',
        postal_code: '10001',
      })
    );

    const { result } = renderHook(() => useNativeCreditCardController());

    let tokenResult: any;
    await act(async () => {
      tokenResult = await result.current.tokenize();
    });

    expect(mockTokenize).toHaveBeenCalledWith(
      42,
      'pk_test_123',
      'https://api-staging.bolt.com'
    );
    expect(tokenResult).toEqual({
      token: 'bolt_cc_test123',
      last4: '4242',
      bin: '424242',
      network: 'visa',
      expiration: '2028-12',
      postal_code: '10001',
    });
  });

  it('should return Error when native module rejects', async () => {
    mockTokenize.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useNativeCreditCardController());

    let tokenResult: any;
    await act(async () => {
      tokenResult = await result.current.tokenize();
    });

    expect(tokenResult).toBeInstanceOf(Error);
    expect(tokenResult.message).toBe('Network error');
  });

  it('should return Error when response has no token', async () => {
    mockTokenize.mockResolvedValue(JSON.stringify({ last4: '4242' }));

    const { result } = renderHook(() => useNativeCreditCardController());

    let tokenResult: any;
    await act(async () => {
      tokenResult = await result.current.tokenize();
    });

    expect(tokenResult).toBeInstanceOf(Error);
    expect(tokenResult.message).toBe('Tokenization failed: no token returned');
  });

  it('should return Error when view is not mounted', async () => {
    (findNodeHandle as unknown as jest.Mock).mockReturnValue(null);

    const { result } = renderHook(() => useNativeCreditCardController());

    let tokenResult: any;
    await act(async () => {
      tokenResult = await result.current.tokenize();
    });

    expect(tokenResult).toBeInstanceOf(Error);
    expect(tokenResult.message).toBe('Native credit card view not mounted');
    expect(mockTokenize).not.toHaveBeenCalled();
  });

  it('should return Error on malformed JSON response', async () => {
    mockTokenize.mockResolvedValue('not json');

    const { result } = renderHook(() => useNativeCreditCardController());
    (findNodeHandle as jest.Mock).mockReturnValue(42);

    let tokenResult: any;
    await act(async () => {
      tokenResult = await result.current.tokenize();
    });

    expect(tokenResult).toBeInstanceOf(Error);
    expect(tokenResult.message).toBe('Failed to parse tokenization result');
  });

  it('should handle TokenResult with null fields gracefully', async () => {
    mockTokenize.mockResolvedValue(
      JSON.stringify({
        token: 'bolt_cc_abc',
        last4: null,
        bin: null,
        network: null,
        expiration: null,
        postal_code: null,
      })
    );

    const { result } = renderHook(() => useNativeCreditCardController());
    (findNodeHandle as jest.Mock).mockReturnValue(42);

    let tokenResult: any;
    await act(async () => {
      tokenResult = await result.current.tokenize();
    });

    expect(tokenResult.token).toBe('bolt_cc_abc');
    expect(tokenResult.last4).toBeUndefined();
    expect(tokenResult.bin).toBeUndefined();
  });

  it('should not throw when setStyles is called', () => {
    const { result } = renderHook(() => useNativeCreditCardController());

    expect(() => {
      result.current.setStyles({ textColor: '#000', fontSize: 16 });
    }).not.toThrow();
  });
});

describe('useNativeCreditCardController — null native module', () => {
  it('should return Error when native module is null', async () => {
    // Temporarily override the mock to return null
    const moduleExports = require('../native/NativeBoltCardFieldModule');
    const original = moduleExports.default;
    moduleExports.default = null;

    const { result } = renderHook(() => useNativeCreditCardController());

    let tokenResult: any;
    await act(async () => {
      tokenResult = await result.current.tokenize();
    });

    expect(tokenResult).toBeInstanceOf(Error);
    expect(tokenResult.message).toBe(
      'BoltCardField native module not available'
    );

    // Restore
    moduleExports.default = original;
  });
});
