import { BoltBridgeDispatcher } from '../bridge/BoltBridgeDispatcher';

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

  it('should reset state correctly', () => {
    const { dispatcher } = createDispatcher();
    dispatcher.handleMessage(makeBridgeReadyEvent());
    expect(dispatcher.isReady()).toBe(true);

    dispatcher.reset();
    expect(dispatcher.isReady()).toBe(false);
  });
});
