import { Bolt } from '../client/Bolt';
import { BoltBridgeDispatcher } from '../bridge/BoltBridgeDispatcher';
import { BoltRpcHandler } from '../bridge/BoltRpcHandler';

const RPC_PORT_ID = 'vp_rpc_main';

const makeBridgeReadyEvent = () => ({
  nativeEvent: {
    data: JSON.stringify({
      __boltBridge: true,
      direction: 'outbound',
      type: 'bridgeReady',
    }),
  },
});

const makePortMessageEvent = (data: unknown, virtualPortId = RPC_PORT_ID) => ({
  nativeEvent: {
    data: JSON.stringify({
      __boltBridge: true,
      direction: 'outbound',
      type: 'portMessage',
      data,
      virtualPortId,
    }),
  },
});

const createDispatcher = () => {
  const injectedScripts: string[] = [];
  const ref = {
    current: {
      injectJavaScript: jest.fn((js: string) => {
        injectedScripts.push(js);
      }),
      reload: jest.fn(),
    },
  };
  const dispatcher = new BoltBridgeDispatcher(ref as any);
  return { dispatcher, injectedScripts };
};

const parseLastInjected = (script: string) => {
  // injected JS form: window.__boltBridgeReceive("<json>");true;
  const match = script.match(/__boltBridgeReceive\((".*")\)/s);
  if (!match) throw new Error(`Could not parse injected JS: ${script}`);
  const inner = JSON.parse(match[1]!) as string;
  return JSON.parse(inner);
};

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

describe('BoltRpcHandler', () => {
  let bolt: Bolt;

  beforeEach(() => {
    bolt = new Bolt({
      publishableKey: 'pk_test_123',
      environment: 'sandbox',
    });
    (globalThis as any).fetch = jest.fn();
  });

  afterEach(() => {
    delete (globalThis as any).fetch;
  });

  it('emits the setPort handshake when the bridge becomes ready', () => {
    const { dispatcher, injectedScripts } = createDispatcher();
    const handler = new BoltRpcHandler(dispatcher, bolt);
    handler.start();

    dispatcher.handleMessage(makeBridgeReadyEvent());

    expect(injectedScripts).toHaveLength(1);
    const envelope = parseLastInjected(injectedScripts[0]!);
    expect(envelope).toMatchObject({
      __boltBridge: true,
      type: 'postMessage',
      virtualPortId: RPC_PORT_ID,
      data: { type: 'setPort', payload: 'rn-bridge' },
    });
  });

  it('responds to loadMerchantDetails by fetching from the public API', async () => {
    const merchantPayload = {
      merchant_description: 'Acme Inc',
      copy_customizations: [
        { copy_key: 'card.label', custom_text: 'Card', language_code: 'en' },
      ],
    };
    (globalThis as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => merchantPayload,
    }));

    const { dispatcher, injectedScripts } = createDispatcher();
    const handler = new BoltRpcHandler(dispatcher, bolt);
    handler.start();

    dispatcher.handleMessage(makeBridgeReadyEvent());
    // First injected script is the setPort bootstrap.
    injectedScripts.length = 0;

    dispatcher.handleMessage(
      makePortMessageEvent({ type: 'loadMerchantDetails' })
    );
    await flushMicrotasks();

    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
    const fetchUrl = (globalThis as any).fetch.mock.calls[0][0] as string;
    expect(fetchUrl).toContain(`${bolt.apiUrl}/v1/merchant`);
    expect(fetchUrl).toContain('publishable_key=pk_test_123');

    expect(injectedScripts).toHaveLength(1);
    const envelope = parseLastInjected(injectedScripts[0]!);
    expect(envelope).toMatchObject({
      type: 'portMessage',
      virtualPortId: RPC_PORT_ID,
      data: {
        type: 'loadMerchantDetailsSucceeded',
        payload: merchantPayload,
      },
    });
  });

  it('caches loadMerchantDetails responses across requests', async () => {
    (globalThis as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ merchant_description: 'Acme' }),
    }));

    const { dispatcher } = createDispatcher();
    const handler = new BoltRpcHandler(dispatcher, bolt);
    handler.start();
    dispatcher.handleMessage(makeBridgeReadyEvent());

    dispatcher.handleMessage(
      makePortMessageEvent({ type: 'loadMerchantDetails' })
    );
    dispatcher.handleMessage(
      makePortMessageEvent({ type: 'loadMerchantDetails' })
    );
    await flushMicrotasks();

    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);
  });

  it('reports loadMerchantDetailsFailed on a non-OK response', async () => {
    (globalThis as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({}),
    }));

    const { dispatcher, injectedScripts } = createDispatcher();
    const handler = new BoltRpcHandler(dispatcher, bolt);
    handler.start();
    dispatcher.handleMessage(makeBridgeReadyEvent());
    injectedScripts.length = 0;

    dispatcher.handleMessage(
      makePortMessageEvent({ type: 'loadMerchantDetails' })
    );
    await flushMicrotasks();

    expect(injectedScripts).toHaveLength(1);
    const envelope = parseLastInjected(injectedScripts[0]!);
    expect(envelope).toMatchObject({
      type: 'portMessage',
      virtualPortId: RPC_PORT_ID,
      data: {
        type: 'loadMerchantDetailsFailed',
      },
    });
    expect(envelope.data.payload).toContain('500');
  });

  it('replies Failed for unknown RPC types so the iframe never hangs', async () => {
    const { dispatcher, injectedScripts } = createDispatcher();
    const handler = new BoltRpcHandler(dispatcher, bolt);
    handler.start();
    dispatcher.handleMessage(makeBridgeReadyEvent());
    injectedScripts.length = 0;

    dispatcher.handleMessage(makePortMessageEvent({ type: 'somethingElse' }));
    await flushMicrotasks();

    expect(injectedScripts).toHaveLength(1);
    const envelope = parseLastInjected(injectedScripts[0]!);
    expect(envelope).toMatchObject({
      type: 'portMessage',
      virtualPortId: RPC_PORT_ID,
      data: { type: 'somethingElseFailed' },
    });
    expect(envelope.data.payload).toContain('unsupported');
  });

  it('retries loadMerchantDetails after a failure (cache evicted)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ merchant_description: 'Acme' }),
      });
    (globalThis as any).fetch = fetchMock;

    const { dispatcher, injectedScripts } = createDispatcher();
    const handler = new BoltRpcHandler(dispatcher, bolt);
    handler.start();
    dispatcher.handleMessage(makeBridgeReadyEvent());
    injectedScripts.length = 0;

    dispatcher.handleMessage(
      makePortMessageEvent({ type: 'loadMerchantDetails' })
    );
    await flushMicrotasks();
    await flushMicrotasks();

    dispatcher.handleMessage(
      makePortMessageEvent({ type: 'loadMerchantDetails' })
    );
    await flushMicrotasks();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const replies = injectedScripts.map(parseLastInjected);
    expect(replies[0].data.type).toBe('loadMerchantDetailsFailed');
    expect(replies[1].data.type).toBe('loadMerchantDetailsSucceeded');
  });

  it('reset() drops the merchant cache so a reload re-fetches', async () => {
    (globalThis as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ merchant_description: 'Acme' }),
    }));

    const { dispatcher } = createDispatcher();
    const handler = new BoltRpcHandler(dispatcher, bolt);
    handler.start();
    dispatcher.handleMessage(makeBridgeReadyEvent());

    dispatcher.handleMessage(
      makePortMessageEvent({ type: 'loadMerchantDetails' })
    );
    await flushMicrotasks();
    expect((globalThis as any).fetch).toHaveBeenCalledTimes(1);

    handler.reset();

    dispatcher.handleMessage(
      makePortMessageEvent({ type: 'loadMerchantDetails' })
    );
    await flushMicrotasks();
    expect((globalThis as any).fetch).toHaveBeenCalledTimes(2);
  });

  it('re-emits the setPort handshake after dispatcher.reset() + bridgeReady', () => {
    const { dispatcher, injectedScripts } = createDispatcher();
    const handler = new BoltRpcHandler(dispatcher, bolt);
    handler.start();

    dispatcher.handleMessage(makeBridgeReadyEvent());
    expect(injectedScripts).toHaveLength(1);

    dispatcher.reset();
    dispatcher.handleMessage(makeBridgeReadyEvent());

    expect(injectedScripts).toHaveLength(2);
    const second = parseLastInjected(injectedScripts[1]!);
    expect(second.data).toMatchObject({
      type: 'setPort',
      payload: 'rn-bridge',
    });
  });

  it('drops malformed JSON port messages without replying', async () => {
    (globalThis as any).fetch = jest.fn();
    const { dispatcher, injectedScripts } = createDispatcher();
    const handler = new BoltRpcHandler(dispatcher, bolt);
    handler.start();
    dispatcher.handleMessage(makeBridgeReadyEvent());
    injectedScripts.length = 0;

    dispatcher.handleMessage(makePortMessageEvent('not-json{'));
    dispatcher.handleMessage(makePortMessageEvent({ payload: {} }));
    await flushMicrotasks();

    expect((globalThis as any).fetch).not.toHaveBeenCalled();
    expect(injectedScripts).toHaveLength(0);
  });

  it('omits an empty referrer query param', async () => {
    (globalThis as any).fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({}),
    }));

    const { dispatcher } = createDispatcher();
    const handler = new BoltRpcHandler(dispatcher, bolt);
    handler.start();
    dispatcher.handleMessage(makeBridgeReadyEvent());

    dispatcher.handleMessage(
      makePortMessageEvent({ type: 'loadMerchantDetails' })
    );
    await flushMicrotasks();

    const fetchUrl = (globalThis as any).fetch.mock.calls[0][0] as string;
    expect(fetchUrl).not.toContain('referrer=');
  });

  it('ignores the iframe-side initialized event without responding', async () => {
    const { dispatcher, injectedScripts } = createDispatcher();
    const handler = new BoltRpcHandler(dispatcher, bolt);
    handler.start();
    dispatcher.handleMessage(makeBridgeReadyEvent());
    injectedScripts.length = 0;

    dispatcher.handleMessage(makePortMessageEvent({ type: 'initialized' }));
    await flushMicrotasks();

    expect(injectedScripts).toHaveLength(0);
  });

  it('stop() unsubscribes so further port messages are ignored', async () => {
    (globalThis as any).fetch = jest.fn();
    const { dispatcher, injectedScripts } = createDispatcher();
    const handler = new BoltRpcHandler(dispatcher, bolt);
    handler.start();
    dispatcher.handleMessage(makeBridgeReadyEvent());
    injectedScripts.length = 0;

    handler.stop();
    dispatcher.handleMessage(
      makePortMessageEvent({ type: 'loadMerchantDetails' })
    );
    await flushMicrotasks();

    expect((globalThis as any).fetch).not.toHaveBeenCalled();
    expect(injectedScripts).toHaveLength(0);
  });
});
