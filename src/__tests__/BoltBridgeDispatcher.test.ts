import { BoltBridgeDispatcher } from '../bridge/BoltBridgeDispatcher';
import { INJECTED_BRIDGE_JS } from '../bridge/injectedBridge';
import { parseBoltMessage } from '../bridge/parseBoltMessage';
import { validationErrorMap } from '../payments/types';

const createMockWebViewRef = () => {
  const injectedScripts: string[] = [];
  const ref = {
    current: {
      injectJavaScript: jest.fn((js: string) => {
        injectedScripts.push(js);
      }),
      reload: jest.fn(),
    },
  };
  return { ref, injectedScripts };
};

const createDispatcher = () => {
  const { ref, injectedScripts } = createMockWebViewRef();
  const dispatcher = new BoltBridgeDispatcher(ref as any);
  return { dispatcher, ref, injectedScripts };
};

const makeBridgeReadyEvent = () => ({
  nativeEvent: {
    data: JSON.stringify({
      __boltBridge: true,
      direction: 'outbound',
      type: 'bridgeReady',
    }),
  },
});

const makePostMessageEvent = (data: unknown) => ({
  nativeEvent: {
    data: JSON.stringify({
      __boltBridge: true,
      direction: 'outbound',
      type: 'postMessage',
      data,
    }),
  },
});

describe('BoltBridgeDispatcher', () => {
  it('should fire ready listeners on bridgeReady envelope', () => {
    const { dispatcher } = createDispatcher();
    const onReady = jest.fn();

    dispatcher.onReady(onReady);
    dispatcher.handleMessage(makeBridgeReadyEvent());

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(dispatcher.isReady()).toBe(true);
  });

  it('should immediately call onReady if already ready', () => {
    const { dispatcher } = createDispatcher();
    dispatcher.handleMessage(makeBridgeReadyEvent());

    const onReady = jest.fn();
    dispatcher.onReady(onReady);

    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('should ignore duplicate bridgeReady envelopes', () => {
    const { dispatcher } = createDispatcher();
    const onReady = jest.fn();

    dispatcher.onReady(onReady);
    dispatcher.handleMessage(makeBridgeReadyEvent());
    dispatcher.handleMessage(makeBridgeReadyEvent());

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(dispatcher.isReady()).toBe(true);
  });

  it('should not re-flush pending messages on duplicate bridgeReady', () => {
    const { dispatcher, injectedScripts } = createDispatcher();

    dispatcher.sendMessage('queued');
    dispatcher.handleMessage(makeBridgeReadyEvent());
    const countAfterFirst = injectedScripts.length;

    dispatcher.handleMessage(makeBridgeReadyEvent());
    expect(injectedScripts).toHaveLength(countAfterFirst);
  });

  it('should route postMessage envelopes to message listeners', () => {
    const { dispatcher } = createDispatcher();
    const listener = jest.fn();
    dispatcher.onMessage(listener);

    dispatcher.handleMessage(makePostMessageEvent('hello'));

    expect(listener).toHaveBeenCalledWith('hello', undefined);
  });

  it('should route non-envelope JSON as raw Bolt messages', () => {
    const { dispatcher } = createDispatcher();
    const listener = jest.fn();
    dispatcher.onMessage(listener);

    const event = {
      nativeEvent: {
        data: JSON.stringify({ type: 'FrameInitialized' }),
      },
    };
    dispatcher.handleMessage(event);

    // Raw messages are passed as the original string
    expect(listener).toHaveBeenCalledWith(
      JSON.stringify({ type: 'FrameInitialized' }),
      undefined
    );
  });

  it('should queue messages before bridge is ready and flush on ready', () => {
    const { dispatcher, injectedScripts } = createDispatcher();

    dispatcher.sendMessage('queued-message');
    expect(injectedScripts).toHaveLength(0);

    dispatcher.handleMessage(makeBridgeReadyEvent());
    expect(injectedScripts).toHaveLength(1);
    expect(injectedScripts[0]).toContain('__boltBridgeReceive');
  });

  it('should send messages immediately when bridge is ready', () => {
    const { dispatcher, injectedScripts } = createDispatcher();
    dispatcher.handleMessage(makeBridgeReadyEvent());

    dispatcher.sendMessage('immediate-message');
    expect(injectedScripts).toHaveLength(1);
  });

  it('should route port messages to port listeners', () => {
    const { dispatcher } = createDispatcher();
    const portListener = jest.fn();
    dispatcher.onPortMessage('port-1', portListener);

    const event = {
      nativeEvent: {
        data: JSON.stringify({
          __boltBridge: true,
          direction: 'outbound',
          type: 'portMessage',
          data: 'port-data',
          virtualPortId: 'port-1',
        }),
      },
    };
    dispatcher.handleMessage(event);

    expect(portListener).toHaveBeenCalledWith('port-data', 'port-1');
  });

  it('should allow unsubscribing message listeners', () => {
    const { dispatcher } = createDispatcher();
    const listener = jest.fn();
    const unsub = dispatcher.onMessage(listener);

    unsub();

    dispatcher.handleMessage(makePostMessageEvent('should-not-receive'));
    expect(listener).not.toHaveBeenCalled();
  });

  it('should allow unsubscribing ready listeners', () => {
    const { dispatcher } = createDispatcher();
    const onReady = jest.fn();
    const unsub = dispatcher.onReady(onReady);

    unsub();
    dispatcher.handleMessage(makeBridgeReadyEvent());

    expect(onReady).not.toHaveBeenCalled();
  });

  it('should allow unsubscribing port listeners', () => {
    const { dispatcher } = createDispatcher();
    const portListener = jest.fn();
    const unsub = dispatcher.onPortMessage('port-1', portListener);

    unsub();

    const event = {
      nativeEvent: {
        data: JSON.stringify({
          __boltBridge: true,
          direction: 'outbound',
          type: 'portMessage',
          data: 'port-data',
          virtualPortId: 'port-1',
        }),
      },
    };
    dispatcher.handleMessage(event);

    expect(portListener).not.toHaveBeenCalled();
  });

  it('should handle non-JSON messages without throwing', () => {
    const { dispatcher } = createDispatcher();
    const listener = jest.fn();
    dispatcher.onMessage(listener);

    const event = { nativeEvent: { data: 'not-json' } };
    expect(() => dispatcher.handleMessage(event)).not.toThrow();
    expect(listener).toHaveBeenCalledWith('not-json', undefined);
  });

  it('should reset state correctly', () => {
    const { dispatcher } = createDispatcher();
    dispatcher.handleMessage(makeBridgeReadyEvent());
    expect(dispatcher.isReady()).toBe(true);

    dispatcher.reset();
    expect(dispatcher.isReady()).toBe(false);
  });

  it('should allow setting webView via setWebView', () => {
    const ref = { current: null };
    const dispatcher = new BoltBridgeDispatcher(ref as any);

    const mockWebView = {
      injectJavaScript: jest.fn(),
      reload: jest.fn(),
    };
    dispatcher.setWebView(mockWebView as any);

    // Make bridge ready and send a message
    dispatcher.handleMessage(makeBridgeReadyEvent());
    dispatcher.sendMessage('test');

    expect(mockWebView.injectJavaScript).toHaveBeenCalled();
  });

  it('sendBootstrapPort emits a postMessage envelope with virtualPortId', () => {
    const { dispatcher, injectedScripts } = createDispatcher();
    dispatcher.handleMessage(makeBridgeReadyEvent());

    dispatcher.sendBootstrapPort('vp_test', { type: 'setPort', payload: 'x' });

    expect(injectedScripts).toHaveLength(1);
    const match = injectedScripts[0]!.match(/__boltBridgeReceive\((".*")\)/s);
    expect(match).not.toBeNull();
    const inner = JSON.parse(match![1]!) as string;
    const envelope = JSON.parse(inner);
    expect(envelope).toMatchObject({
      __boltBridge: true,
      type: 'postMessage',
      virtualPortId: 'vp_test',
      data: { type: 'setPort', payload: 'x' },
    });
  });

  it('sendBootstrapPort queues until bridge ready', () => {
    const { dispatcher, injectedScripts } = createDispatcher();
    dispatcher.sendBootstrapPort('vp_test', { type: 'setPort' });
    expect(injectedScripts).toHaveLength(0);

    dispatcher.handleMessage(makeBridgeReadyEvent());
    expect(injectedScripts).toHaveLength(1);
  });

  it('onReady listener fires on every transition to ready', () => {
    const { dispatcher } = createDispatcher();
    const onReady = jest.fn();
    dispatcher.onReady(onReady);

    dispatcher.handleMessage(makeBridgeReadyEvent());
    expect(onReady).toHaveBeenCalledTimes(1);

    dispatcher.reset();
    dispatcher.handleMessage(makeBridgeReadyEvent());
    expect(onReady).toHaveBeenCalledTimes(2);
  });

  it('should not throw when sending message with no webView', () => {
    const ref = { current: null };
    const dispatcher = new BoltBridgeDispatcher(ref as any);
    dispatcher.handleMessage(makeBridgeReadyEvent());

    expect(() => dispatcher.sendMessage('test')).not.toThrow();
  });

  it('should catch and log errors thrown by message listeners', () => {
    const { dispatcher } = createDispatcher();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();

    dispatcher.onMessage(() => {
      throw new Error('listener exploded');
    });
    dispatcher.handleMessage(makePostMessageEvent('boom'));

    expect(errorSpy).toHaveBeenCalledWith(
      '[Bolt] Error in message listener',
      expect.anything()
    );
    errorSpy.mockRestore();
  });
});

describe('INJECTED_BRIDGE_JS', () => {
  it('should guard against running in sub-iframes', () => {
    expect(INJECTED_BRIDGE_JS).toContain(
      'if (window.parent !== window) return'
    );
  });

  it('should guard against double-injection', () => {
    expect(INJECTED_BRIDGE_JS).toContain('__boltBridgeInitialized');
  });

  it('should override removeEventListener for message type', () => {
    expect(INJECTED_BRIDGE_JS).toContain(
      'window.removeEventListener = function'
    );
  });

  it('should prevent duplicate addEventListener registrations', () => {
    expect(INJECTED_BRIDGE_JS).toContain('messageListeners.indexOf(listener)');
  });

  it('should expose __boltBridgeReceive global', () => {
    expect(INJECTED_BRIDGE_JS).toContain(
      'window.__boltBridgeReceive = function'
    );
  });

  it('should signal bridgeReady only once', () => {
    expect(INJECTED_BRIDGE_JS).toContain('function signalReady()');
    expect(INJECTED_BRIDGE_JS).toContain('if (bridgeReady) return');
  });
});

describe('INJECTED_BRIDGE_JS — VirtualMessagePort runtime', () => {
  // Evaluate the injected script in a sandboxed window so we can drive the
  // virtual port directly. The script bails out unless window.parent ===
  // window, so we set that up before evaluating.
  const makeSandbox = () => {
    const sandbox: any = {};
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.parent = sandbox;
    sandbox.location = { origin: 'https://iframe.test' };
    sandbox.document = {
      readyState: 'complete',
      addEventListener: () => {},
      referrer: '',
    };
    sandbox.ReactNativeWebView = { postMessage: jest.fn() };
    sandbox.console = { error: jest.fn(), log: jest.fn(), warn: jest.fn() };
    sandbox.addEventListener = () => {};
    sandbox.removeEventListener = () => {};
    // The script references bare `document` and `console` (e.g.
    // document.readyState, console.error). Pass them as function
    // parameters so lookups resolve locally instead of escaping to the
    // test's global scope.
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'console', INJECTED_BRIDGE_JS)(
      sandbox,
      sandbox.document,
      sandbox.console
    );
    return sandbox;
  };

  const capturePort = (sandbox: any, portId: string) => {
    let port: any = null;
    sandbox.addEventListener('message', (event: any) => {
      if (event.ports && event.ports[0]) port = event.ports[0];
    });
    sandbox.__boltBridgeReceive(
      JSON.stringify({
        __boltBridge: true,
        type: 'postMessage',
        virtualPortId: portId,
        data: null,
      })
    );
    return port;
  };

  it('dispatches port messages to addEventListener("message") with origin ""', () => {
    const sandbox = makeSandbox();
    const port = capturePort(sandbox, 'vp_capture');

    expect(port).not.toBeNull();
    expect(typeof port.addEventListener).toBe('function');
    expect(typeof port.removeEventListener).toBe('function');

    port.start();
    const events: any[] = [];
    const listener = (e: any) => events.push(e);
    port.addEventListener('message', listener);
    // Duplicate add is deduped.
    port.addEventListener('message', listener);

    sandbox.__boltBridgeReceive(
      JSON.stringify({
        __boltBridge: true,
        type: 'portMessage',
        virtualPortId: 'vp_capture',
        data: 'payload-1',
      })
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ data: 'payload-1', origin: '' });

    port.removeEventListener('message', listener);
    sandbox.__boltBridgeReceive(
      JSON.stringify({
        __boltBridge: true,
        type: 'portMessage',
        virtualPortId: 'vp_capture',
        data: 'payload-2',
      })
    );
    expect(events).toHaveLength(1);
  });

  it('addEventListener ignores non-message types and non-functions', () => {
    const sandbox = makeSandbox();
    const port = capturePort(sandbox, 'vp_filter');
    port.start();

    expect(() => port.addEventListener('not-message', () => {})).not.toThrow();
    expect(() => port.addEventListener('message', null)).not.toThrow();
    expect(() => port.addEventListener('message', 'not-a-fn')).not.toThrow();

    const real = jest.fn();
    port.addEventListener('message', real);
    sandbox.__boltBridgeReceive(
      JSON.stringify({
        __boltBridge: true,
        type: 'portMessage',
        virtualPortId: 'vp_filter',
        data: 'x',
      })
    );
    expect(real).toHaveBeenCalledTimes(1);
  });

  it('a throwing listener does not block sibling listeners', () => {
    const sandbox = makeSandbox();
    const port = capturePort(sandbox, 'vp_throw');
    port.start();

    const sibling = jest.fn();
    port.addEventListener('message', () => {
      throw new Error('boom');
    });
    port.addEventListener('message', sibling);

    sandbox.__boltBridgeReceive(
      JSON.stringify({
        __boltBridge: true,
        type: 'portMessage',
        virtualPortId: 'vp_throw',
        data: 'x',
      })
    );

    expect(sibling).toHaveBeenCalledTimes(1);
    expect(sandbox.console.error).toHaveBeenCalled();
  });
});

describe('parseBoltMessage', () => {
  it('should parse a JSON string', () => {
    const result = parseBoltMessage('{"type":"Focus"}');
    expect(result).toEqual({ type: 'Focus' });
  });

  it('should handle double-serialized JSON', () => {
    const inner = JSON.stringify({ type: 'Focus' });
    const result = parseBoltMessage(inner);
    expect(result).toEqual({ type: 'Focus' });
  });

  it('should pass through an already-parsed object', () => {
    const result = parseBoltMessage({ type: 'Focus' });
    expect(result).toEqual({ type: 'Focus' });
  });

  it('should return null for non-JSON strings', () => {
    expect(parseBoltMessage('not json')).toBeNull();
  });

  it('should return null for primitives', () => {
    expect(parseBoltMessage(42)).toBeNull();
    expect(parseBoltMessage(null)).toBeNull();
    expect(parseBoltMessage(undefined)).toBeNull();
    expect(parseBoltMessage(true)).toBeNull();
  });
});

describe('validationErrorMap', () => {
  it('should contain all expected validation codes', () => {
    const expectedCodes = [
      1000, 2000, 3000, 1001, 2001, 3001, 1002, 2002, 1003, 2003,
    ];
    for (const code of expectedCodes) {
      expect(validationErrorMap.has(code)).toBe(true);
      expect(typeof validationErrorMap.get(code)).toBe('string');
    }
  });

  it('should have 10 entries', () => {
    expect(validationErrorMap.size).toBe(10);
  });

  it('should return undefined for unknown codes', () => {
    expect(validationErrorMap.get(9999)).toBeUndefined();
  });
});

describe('tokenize flow (via dispatcher)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should resolve immediately on success GetTokenReply', async () => {
    const { dispatcher } = createDispatcher();
    dispatcher.handleMessage(makeBridgeReadyEvent());

    // Simulate tokenize-like flow using the dispatcher directly
    const promise = new Promise<any>((resolve) => {
      let resolved = false;

      const unsub = dispatcher.onMessage((data) => {
        if (resolved) return;
        const msg = parseBoltMessage(data);
        if (!msg || msg.type !== 'GetTokenReply') return;

        const token = msg.token as Record<string, unknown> | undefined;
        if (
          token &&
          typeof token === 'object' &&
          'token' in token &&
          !('errorMessage' in token)
        ) {
          resolved = true;
          unsub();
          resolve({ token: String(token.token), last4: String(token.last4) });
        }
      });

      dispatcher.sendMessage(JSON.stringify({ type: 'GetToken' }));
    });

    // Simulate success reply from iframe
    dispatcher.handleMessage(
      makePostMessageEvent(
        JSON.stringify({
          type: 'GetTokenReply',
          token: { token: 'abc123', last4: '4242', bin: '424242' },
        })
      )
    );

    const result = await promise;
    expect(result.token).toBe('abc123');
    expect(result.last4).toBe('4242');
  });

  it('should resolve with success even if errors arrive first', async () => {
    const { dispatcher } = createDispatcher();
    dispatcher.handleMessage(makeBridgeReadyEvent());

    let firstError: Error | null = null;
    let resolvedValue: any = null;

    const promise = new Promise<any>((resolve) => {
      let resolved = false;
      let errorDebounce: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        resolved = true;
        if (errorDebounce !== null) clearTimeout(errorDebounce);
        unsub();
      };

      const unsub = dispatcher.onMessage((data) => {
        if (resolved) return;
        const msg = parseBoltMessage(data);
        if (!msg || msg.type !== 'GetTokenReply') return;

        const token = msg.token as Record<string, unknown> | undefined;

        if (
          token &&
          typeof token === 'object' &&
          'token' in token &&
          !('errorMessage' in token)
        ) {
          cleanup();
          resolve({ success: true, token: String(token.token) });
          return;
        }

        if (
          !firstError &&
          token &&
          typeof token === 'object' &&
          'errorMessage' in token
        ) {
          const code = Number(token.errorMessage);
          firstError = new Error(validationErrorMap.get(code) ?? String(code));
        }

        if (errorDebounce !== null) clearTimeout(errorDebounce);
        errorDebounce = setTimeout(() => {
          if (resolved) return;
          cleanup();
          resolve(firstError ?? new Error('Tokenization failed'));
        }, 1500);
      });

      dispatcher.sendMessage(JSON.stringify({ type: 'GetToken' }));
    });

    // Send error replies first (like the iframe flood)
    dispatcher.handleMessage(
      makePostMessageEvent(
        JSON.stringify({
          type: 'GetTokenReply',
          token: { errorMessage: 1000 },
        })
      )
    );
    dispatcher.handleMessage(
      makePostMessageEvent(
        JSON.stringify({
          type: 'GetTokenReply',
          token: { errorMessage: 2000 },
        })
      )
    );

    // Then send success reply
    dispatcher.handleMessage(
      makePostMessageEvent(
        JSON.stringify({
          type: 'GetTokenReply',
          token: { token: 'tok_success', last4: '1234' },
        })
      )
    );

    resolvedValue = await promise;
    expect(resolvedValue.success).toBe(true);
    expect(resolvedValue.token).toBe('tok_success');
  });

  it('should resolve with error after debounce if no success arrives', async () => {
    const { dispatcher } = createDispatcher();
    dispatcher.handleMessage(makeBridgeReadyEvent());

    const promise = new Promise<any>((resolve) => {
      let resolved = false;
      let firstError: Error | null = null;
      let errorDebounce: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        resolved = true;
        if (errorDebounce !== null) clearTimeout(errorDebounce);
        unsub();
      };

      const unsub = dispatcher.onMessage((data) => {
        if (resolved) return;
        const msg = parseBoltMessage(data);
        if (!msg || msg.type !== 'GetTokenReply') return;

        const token = msg.token as Record<string, unknown> | undefined;

        if (
          token &&
          typeof token === 'object' &&
          'token' in token &&
          !('errorMessage' in token)
        ) {
          cleanup();
          resolve({ success: true });
          return;
        }

        if (
          !firstError &&
          token &&
          typeof token === 'object' &&
          'errorMessage' in token
        ) {
          const code = Number(token.errorMessage);
          firstError = new Error(validationErrorMap.get(code) ?? String(code));
        }

        if (errorDebounce !== null) clearTimeout(errorDebounce);
        errorDebounce = setTimeout(() => {
          if (resolved) return;
          cleanup();
          resolve(firstError ?? new Error('Tokenization failed'));
        }, 1500);
      });

      dispatcher.sendMessage(JSON.stringify({ type: 'GetToken' }));
    });

    // Send only error replies — no success
    dispatcher.handleMessage(
      makePostMessageEvent(
        JSON.stringify({
          type: 'GetTokenReply',
          token: { errorMessage: 1000 },
        })
      )
    );

    // Advance timers past the 1.5s debounce
    jest.advanceTimersByTime(2000);

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('Credit card number is required');
  });
});
