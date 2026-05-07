import type { Bolt } from '../client/Bolt';
import { BoltAttributes } from '../telemetry/attributes';
import { logger } from '../telemetry/logger';
import type { BoltBridgeDispatcher } from './BoltBridgeDispatcher';

/**
 * Bridges the iframe's RPC port to the React Native host: receives request
 * envelopes on a virtual MessagePort and replies with `${type}Succeeded`
 * or `${type}Failed`. Always replies — silence makes the iframe hang.
 */

// Must match the iframe-side rpc layer's expected port name and id;
// changing these silently breaks the handshake.
const RPC_PORT_ID = 'vp_rpc_main';
const RPC_PORT_NAME = 'rn-bridge';
const FETCH_TIMEOUT_MS = 10_000;

interface ValidatedRpcRequest {
  type: string;
  payload: unknown;
}

type RequestHandler<Req = unknown, Res = unknown> = (
  payload: Req
) => Promise<Res>;

interface MerchantDetails {
  copy_customizations?: unknown;
  [key: string]: unknown;
}

export class BoltRpcHandler {
  private readonly dispatcher: BoltBridgeDispatcher;
  private readonly bolt: Bolt;
  private readonly handlers: ReadonlyMap<string, RequestHandler>;
  private cleanups: Array<() => void> = [];
  private merchantDetailsCache?: Promise<MerchantDetails>;

  constructor(dispatcher: BoltBridgeDispatcher, bolt: Bolt) {
    this.dispatcher = dispatcher;
    this.bolt = bolt;
    this.handlers = new Map<string, RequestHandler>([
      ['loadMerchantDetails', this.handleLoadMerchantDetails.bind(this)],
    ]);
  }

  start(): void {
    const removeReady = this.dispatcher.onReady(() => {
      this.dispatcher.sendBootstrapPort(RPC_PORT_ID, {
        type: 'setPort',
        payload: RPC_PORT_NAME,
      });
    });

    const removePort = this.dispatcher.onPortMessage(RPC_PORT_ID, (data) => {
      this.handlePortMessage(data);
    });

    this.cleanups.push(removeReady, removePort);
  }

  stop(): void {
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
  }

  // Drop cached responses so the next request re-fetches. Call after a
  // WebView reload to avoid serving stale merchant details.
  reset(): void {
    this.merchantDetailsCache = undefined;
  }

  private handlePortMessage(raw: unknown): void {
    const msg = this.normalizeRequest(raw);
    if (!msg) return;

    // The iframe-side rpc emits 'initialized' as soon as it receives the
    // port. No reply expected.
    if (msg.type === 'initialized') return;

    const handler = this.handlers.get(msg.type);
    if (!handler) {
      logger.warn('Unhandled RPC request', {
        [BoltAttributes.BRIDGE_MESSAGE_TYPE]: msg.type,
      });
      this.sendReply(msg.type, false, `unsupported RPC type: ${msg.type}`);
      return;
    }

    handler(msg.payload).then(
      (result) => this.sendReply(msg.type, true, result),
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('RPC request failed', {
          [BoltAttributes.BRIDGE_MESSAGE_TYPE]: msg.type,
          [BoltAttributes.ERROR_MESSAGE]: message,
        });
        this.sendReply(msg.type, false, message);
      }
    );
  }

  private sendReply(requestType: string, ok: boolean, payload: unknown): void {
    const replyType = `${requestType}${ok ? 'Succeeded' : 'Failed'}`;
    try {
      this.dispatcher.sendMessage({ type: replyType, payload }, RPC_PORT_ID);
    } catch (err) {
      // If dispatching itself throws, the iframe will hang. Nothing left
      // to do but log loudly.
      logger.error('Failed to send RPC reply', {
        [BoltAttributes.BRIDGE_MESSAGE_TYPE]: replyType,
        [BoltAttributes.ERROR_MESSAGE]:
          err instanceof Error ? err.message : String(err),
      });
    }
  }

  private normalizeRequest(raw: unknown): ValidatedRpcRequest | undefined {
    let obj: unknown = raw;
    if (typeof raw === 'string') {
      try {
        obj = JSON.parse(raw);
      } catch {
        return undefined;
      }
    }
    if (!obj || typeof obj !== 'object') return undefined;
    const { type, payload } = obj as { type?: unknown; payload?: unknown };
    if (typeof type !== 'string') return undefined;
    return { type, payload };
  }

  private handleLoadMerchantDetails(): Promise<MerchantDetails> {
    if (!this.merchantDetailsCache) {
      this.merchantDetailsCache = this.fetchMerchantDetails().catch((err) => {
        // Don't cache failures.
        this.merchantDetailsCache = undefined;
        throw err;
      });
    }
    return this.merchantDetailsCache;
  }

  private async fetchMerchantDetails(): Promise<MerchantDetails> {
    const url = new URL('/v1/merchant', this.bolt.apiUrl);
    url.searchParams.set('publishable_key', this.bolt.publishableKey);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          ...this.bolt.apiHeaders(),
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `loadMerchantDetails failed: ${response.status} ${response.statusText}`
        );
      }

      return (await response.json()) as MerchantDetails;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
