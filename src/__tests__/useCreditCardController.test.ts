import { BoltBridgeDispatcher } from '../bridge/BoltBridgeDispatcher';
import { parseBoltMessage } from '../bridge/parseBoltMessage';
import { validationErrorMap } from '../payments/types';

// Mock react-native-webview
jest.mock('react-native-webview', () => ({}));

/**
 * Tests for the credit card controller's tokenization message flow.
 *
 * These test the message protocol directly through the dispatcher,
 * which is what useCreditCardController uses internally.
 *
 * The flow is:
 *   Host → Frame: GetToken
 *   Frame → Host: GetTokenReply (success or error)
 */
describe('CreditCard tokenization message flow', () => {
  let dispatcher: BoltBridgeDispatcher;
  let sentMessages: string[];

  beforeEach(() => {
    const webViewRef = { current: null };
    dispatcher = new BoltBridgeDispatcher(webViewRef);
    sentMessages = [];

    const mockWebView = {
      injectJavaScript: (js: string) => {
        const match = js.match(
          /window\.__boltBridgeReceive\(("[^"]*(?:\\.[^"]*)*")\)/
        );
        if (match) {
          sentMessages.push(JSON.parse(match[1]!));
        }
      },
    };
    dispatcher.setWebView(mockWebView as any);

    // Mark bridge as ready
    dispatcher.handleMessage({
      nativeEvent: {
        data: JSON.stringify({
          __boltBridge: true,
          direction: 'outbound',
          type: 'bridgeReady',
        }),
      },
    });
  });

  it('should send GetToken message', () => {
    dispatcher.sendMessage(JSON.stringify({ type: 'GetToken' }));

    expect(sentMessages).toHaveLength(1);
    const sent = JSON.parse(sentMessages[0]!);
    const payload = JSON.parse(sent.data);
    expect(payload.type).toBe('GetToken');
  });

  it('should receive successful GetTokenReply with card data', (done) => {
    const unsub = dispatcher.onMessage((data) => {
      const msg = parseBoltMessage(data);
      if (!msg || msg.type !== 'GetTokenReply') return;

      const token = msg.token as Record<string, unknown>;
      expect(token).toBeDefined();
      expect(token.token).toBe('tok_test_abc123');
      expect(token.last4).toBe('1111');
      expect(token.bin).toBe('411111');
      expect(token.network).toBe('visa');
      expect(token.expiration).toBe('2028-12');
      expect(msg.ccPostal).toBe('94105');
      unsub();
      done();
    });

    dispatcher.handleMessage({
      nativeEvent: {
        data: JSON.stringify({
          __boltBridge: true,
          direction: 'outbound',
          type: 'postMessage',
          data: JSON.stringify({
            type: 'GetTokenReply',
            token: {
              token: 'tok_test_abc123',
              last4: '1111',
              bin: '411111',
              network: 'visa',
              expiration: '2028-12',
            },
            ccPostal: '94105',
          }),
        }),
      },
    });
  });

  it('should receive error GetTokenReply with validation error code', (done) => {
    const unsub = dispatcher.onMessage((data) => {
      const msg = parseBoltMessage(data);
      if (!msg || msg.type !== 'GetTokenReply') return;

      const token = msg.token as Record<string, unknown>;
      expect(token).toBeDefined();
      expect(token.errorMessage).toBe(1000);
      unsub();
      done();
    });

    dispatcher.handleMessage({
      nativeEvent: {
        data: JSON.stringify({
          __boltBridge: true,
          direction: 'outbound',
          type: 'postMessage',
          data: JSON.stringify({
            type: 'GetTokenReply',
            token: {
              errorMessage: 1000,
            },
          }),
        }),
      },
    });
  });

  it('should distinguish success from error GetTokenReply', (done) => {
    const results: { isSuccess: boolean; data: Record<string, unknown> }[] = [];

    const unsub = dispatcher.onMessage((data) => {
      const msg = parseBoltMessage(data);
      if (!msg || msg.type !== 'GetTokenReply') return;

      const token = msg.token as Record<string, unknown> | undefined;
      if (
        token &&
        typeof token === 'object' &&
        'token' in token &&
        !('errorMessage' in token)
      ) {
        results.push({ isSuccess: true, data: token });
      } else if (
        token &&
        typeof token === 'object' &&
        'errorMessage' in token
      ) {
        results.push({ isSuccess: false, data: token });
      }

      if (results.length === 2) {
        expect(results[0]!.isSuccess).toBe(false);
        expect(results[0]!.data.errorMessage).toBe(2000);
        expect(results[1]!.isSuccess).toBe(true);
        expect(results[1]!.data.token).toBe('tok_final');
        unsub();
        done();
      }
    });

    // First: error reply (invalid card number)
    dispatcher.handleMessage({
      nativeEvent: {
        data: JSON.stringify({
          __boltBridge: true,
          direction: 'outbound',
          type: 'postMessage',
          data: JSON.stringify({
            type: 'GetTokenReply',
            token: { errorMessage: 2000 },
          }),
        }),
      },
    });

    // Second: success reply (corrected card)
    dispatcher.handleMessage({
      nativeEvent: {
        data: JSON.stringify({
          __boltBridge: true,
          direction: 'outbound',
          type: 'postMessage',
          data: JSON.stringify({
            type: 'GetTokenReply',
            token: {
              token: 'tok_final',
              last4: '4242',
              bin: '424242',
              network: 'visa',
              expiration: '2029-01',
            },
            ccPostal: '10001',
          }),
        }),
      },
    });
  });
});

describe('CreditCard field events', () => {
  let dispatcher: BoltBridgeDispatcher;

  beforeEach(() => {
    const webViewRef = { current: null };
    dispatcher = new BoltBridgeDispatcher(webViewRef);

    dispatcher.handleMessage({
      nativeEvent: {
        data: JSON.stringify({
          __boltBridge: true,
          direction: 'outbound',
          type: 'bridgeReady',
        }),
      },
    });
  });

  it('should receive FrameInitialized event', (done) => {
    const unsub = dispatcher.onMessage((data) => {
      const msg = parseBoltMessage(data);
      if (!msg) return;
      if (
        msg.type === 'CreditCard.FrameInitialized' ||
        msg.type === 'FrameInitialized'
      ) {
        unsub();
        done();
      }
    });

    dispatcher.handleMessage({
      nativeEvent: {
        data: JSON.stringify({
          __boltBridge: true,
          direction: 'outbound',
          type: 'postMessage',
          data: JSON.stringify({
            type: 'CreditCard.FrameInitialized',
          }),
        }),
      },
    });
  });

  it.each(['Focus', 'Blur', 'Valid', 'Error'] as const)(
    'should receive %s field event',
    (eventType, done: any) => {
      const unsub = dispatcher.onMessage((data) => {
        const msg = parseBoltMessage(data);
        if (!msg) return;
        if (msg.type === eventType) {
          unsub();
          done();
        }
      });

      dispatcher.handleMessage({
        nativeEvent: {
          data: JSON.stringify({
            __boltBridge: true,
            direction: 'outbound',
            type: 'postMessage',
            data: JSON.stringify({
              type: eventType,
              ...(eventType === 'Error'
                ? { message: 'Card number is invalid' }
                : {}),
            }),
          }),
        },
      });
    }
  );

  it('should send SetConfig after FrameInitialized', () => {
    const sentMessages: string[] = [];
    const mockWebView = {
      injectJavaScript: (js: string) => {
        const match = js.match(
          /window\.__boltBridgeReceive\(("[^"]*(?:\\.[^"]*)*")\)/
        );
        if (match) {
          sentMessages.push(JSON.parse(match[1]!));
        }
      },
    };
    dispatcher.setWebView(mockWebView as any);

    // After FrameInitialized, the controller sends SetConfig
    dispatcher.sendMessage(
      JSON.stringify({
        type: 'SetConfig',
        config: {
          styles: { 'version': 3, '--bolt-input-fontSize': '16px' },
        },
      })
    );

    expect(sentMessages).toHaveLength(1);
    const sent = JSON.parse(sentMessages[0]!);
    const payload = JSON.parse(sent.data);
    expect(payload.type).toBe('SetConfig');
    expect(payload.config.styles['--bolt-input-fontSize']).toBe('16px');
    expect(payload.config.styles.version).toBe(3);
  });

  it('should send SetStyles message', () => {
    const sentMessages: string[] = [];
    const mockWebView = {
      injectJavaScript: (js: string) => {
        const match = js.match(
          /window\.__boltBridgeReceive\(("[^"]*(?:\\.[^"]*)*")\)/
        );
        if (match) {
          sentMessages.push(JSON.parse(match[1]!));
        }
      },
    };
    dispatcher.setWebView(mockWebView as any);

    dispatcher.sendMessage(
      JSON.stringify({
        type: 'SetStyles',
        styles: { 'version': 3, '--bolt-input-borderColor': '#ff0000' },
      })
    );

    expect(sentMessages).toHaveLength(1);
    const sent = JSON.parse(sentMessages[0]!);
    const payload = JSON.parse(sent.data);
    expect(payload.type).toBe('SetStyles');
    expect(payload.styles['--bolt-input-borderColor']).toBe('#ff0000');
  });
});

describe('CreditCard validation error codes', () => {
  it('should map all validation error codes correctly', () => {
    const expectedMappings: [number, string][] = [
      [1000, 'Credit card number is required'],
      [2000, 'Credit card number is invalid'],
      [3000, 'Credit card type is not supported'],
      [1001, 'Expiration date is required'],
      [2001, 'Expiration date is invalid'],
      [3001, 'Credit card is expired'],
      [1002, 'CVV is required'],
      [2002, 'CVV is invalid'],
      [1003, 'Postal code is required'],
      [2003, 'Postal code is invalid'],
    ];

    for (const [code, message] of expectedMappings) {
      expect(validationErrorMap.get(code)).toBe(message);
    }
  });

  it('should return undefined for unknown error codes', () => {
    expect(validationErrorMap.get(9999)).toBeUndefined();
  });
});

describe('parseBoltMessage', () => {
  it('should parse JSON string messages', () => {
    const result = parseBoltMessage(
      '{"type":"GetTokenReply","token":{"token":"tok_123"}}'
    );
    expect(result).toEqual({
      type: 'GetTokenReply',
      token: { token: 'tok_123' },
    });
  });

  it('should parse already-parsed objects', () => {
    const result = parseBoltMessage({ type: 'Focus' });
    expect(result).toEqual({ type: 'Focus' });
  });

  it('should return null for invalid JSON', () => {
    const result = parseBoltMessage('not json');
    expect(result).toBeNull();
  });

  it('should return null for non-object values', () => {
    expect(parseBoltMessage(42)).toBeNull();
    expect(parseBoltMessage(true)).toBeNull();
    expect(parseBoltMessage(null)).toBeNull();
    expect(parseBoltMessage(undefined)).toBeNull();
  });

  it('should handle double-serialized messages (JSON string within bridge envelope)', () => {
    // The bridge sends data as a JSON string inside the envelope
    const innerMessage = JSON.stringify({
      type: 'GetTokenReply',
      token: { token: 'tok_double' },
    });
    const result = parseBoltMessage(innerMessage);
    expect(result).toEqual({
      type: 'GetTokenReply',
      token: { token: 'tok_double' },
    });
  });
});
