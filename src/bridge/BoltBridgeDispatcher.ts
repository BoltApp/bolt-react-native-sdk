import type { Span } from '@opentelemetry/api';
import type { RefObject } from 'react';
import type WebView from 'react-native-webview';
import { BoltAttributes } from '../telemetry/attributes';
import { logger } from '../telemetry/logger';
import { SpanStatusCode, startSpan } from '../telemetry/tracer';

export interface BridgeEnvelope {
  __boltBridge: true;
  direction: 'inbound' | 'outbound';
  type: 'postMessage' | 'portMessage' | 'bridgeReady';
  data?: unknown;
  virtualPortId?: string;
}

type MessageListener = (data: unknown, virtualPortId?: string) => void;
type PortMessageListener = (data: unknown, portId: string) => void;

/**
 * Manages communication between React Native and a Bolt WebView.
 *
 * Responsibilities:
 * - Receives raw strings from WebView via onMessage callback
 * - Detects bridge envelopes (__boltBridge field) vs raw Bolt messages
 * - Routes events by type to registered listeners
 * - Manages virtual MessagePort channels
 * - Queues messages before bridge is ready, flushes on bridgeReady signal
 * - Provides sendMessage() to send envelopes to the WebView
 */
export class BoltBridgeDispatcher {
  private webViewRef: RefObject<WebView | null>;
  private ready = false;
  private pendingMessages: BridgeEnvelope[] = [];
  private messageListeners: MessageListener[] = [];
  private portListeners: Map<string, PortMessageListener> = new Map();
  private readyListeners: Array<() => void> = [];
  private bridgeReadySpan: Span | undefined;

  constructor(webViewRef: RefObject<WebView | null>) {
    this.webViewRef = webViewRef;
    this.bridgeReadySpan = startSpan('bolt.bridge.ready');
  }

  /**
   * Handle raw message from WebView's onMessage event.
   * Called by BoltPaymentWebView's onMessage prop.
   */
  handleMessage = (event: { nativeEvent: { data: string } }): void => {
    const raw = event.nativeEvent.data;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Not JSON — forward as raw Bolt message
      logger.debug('Received raw (non-JSON) message', {
        [BoltAttributes.BRIDGE_DIRECTION]: 'inbound',
      });
      this.notifyMessageListeners(raw);
      return;
    }

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      '__boltBridge' in parsed
    ) {
      logger.debug('Received envelope', {
        [BoltAttributes.BRIDGE_MESSAGE_TYPE]: (parsed as BridgeEnvelope).type,
        [BoltAttributes.BRIDGE_DIRECTION]: 'inbound',
      });
      this.handleEnvelope(parsed as BridgeEnvelope);
    } else {
      // Valid JSON but not a bridge envelope — it's a Bolt message
      logger.debug('Received bolt message', {
        [BoltAttributes.BRIDGE_DIRECTION]: 'inbound',
      });
      this.notifyMessageListeners(raw);
    }
  };

  /**
   * Send a postMessage to the WebView iframe code.
   * Data should be a JSON string (matching Bolt's serialization format).
   */
  sendMessage(data: unknown, virtualPortId?: string): void {
    const envelope: BridgeEnvelope = {
      __boltBridge: true,
      direction: 'inbound',
      type: virtualPortId ? 'portMessage' : 'postMessage',
      data,
      virtualPortId,
    };

    if (!this.ready) {
      logger.debug('Message queued (bridge not ready)', {
        [BoltAttributes.BRIDGE_MESSAGE_TYPE]: envelope.type,
        [BoltAttributes.BRIDGE_DIRECTION]: 'outbound',
      });
      this.pendingMessages.push(envelope);
      return;
    }

    logger.debug('Sending message', {
      [BoltAttributes.BRIDGE_MESSAGE_TYPE]: envelope.type,
      [BoltAttributes.BRIDGE_DIRECTION]: 'outbound',
    });
    this.injectEnvelope(envelope);
  }

  /**
   * Register a listener for postMessage events from the iframe.
   */
  onMessage(listener: MessageListener): () => void {
    this.messageListeners.push(listener);
    return () => {
      this.messageListeners = this.messageListeners.filter(
        (l) => l !== listener
      );
    };
  }

  /**
   * Register a listener for messages on a specific virtual port.
   */
  onPortMessage(portId: string, listener: PortMessageListener): () => void {
    this.portListeners.set(portId, listener);
    return () => {
      this.portListeners.delete(portId);
    };
  }

  /**
   * Register a listener for when the bridge becomes ready.
   */
  onReady(listener: () => void): () => void {
    if (this.ready) {
      listener();
      return () => {};
    }
    this.readyListeners.push(listener);
    return () => {
      this.readyListeners = this.readyListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Returns whether the bridge is ready.
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Set the WebView instance the dispatcher sends messages to.
   */
  setWebView(webView: WebView | null): void {
    (this.webViewRef as { current: WebView | null }).current = webView;
  }

  /**
   * Reset the dispatcher state (e.g., when WebView reloads).
   */
  reset(): void {
    if (this.bridgeReadySpan) {
      this.bridgeReadySpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: 'Bridge reset before ready',
      });
      this.bridgeReadySpan.end();
    }
    this.ready = false;
    this.pendingMessages = [];
    this.bridgeReadySpan = startSpan('bolt.bridge.ready');
  }

  // ── Private ──────────────────────────────────────────────

  private handleEnvelope(envelope: BridgeEnvelope): void {
    switch (envelope.type) {
      case 'bridgeReady':
        if (this.ready) {
          logger.debug('Bridge already ready, ignoring duplicate bridgeReady');
          break;
        }
        logger.debug('Bridge ready, flushing pending messages', {
          pendingCount: this.pendingMessages.length,
        });
        this.ready = true;
        if (this.bridgeReadySpan) {
          this.bridgeReadySpan.setAttribute(
            'bolt.bridge.pending_count',
            this.pendingMessages.length
          );
          this.bridgeReadySpan.setStatus({ code: SpanStatusCode.OK });
          this.bridgeReadySpan.end();
          this.bridgeReadySpan = undefined;
        }
        this.flushPendingMessages();
        for (const listener of this.readyListeners) {
          listener();
        }
        this.readyListeners = [];
        break;

      case 'postMessage':
        this.notifyMessageListeners(envelope.data, envelope.virtualPortId);
        break;

      case 'portMessage':
        if (envelope.virtualPortId) {
          const portListener = this.portListeners.get(envelope.virtualPortId);
          if (portListener) {
            portListener(envelope.data, envelope.virtualPortId);
          }
        }
        break;
    }
  }

  private notifyMessageListeners(data: unknown, virtualPortId?: string): void {
    for (const listener of this.messageListeners) {
      try {
        listener(data, virtualPortId);
      } catch (err) {
        logger.error('Error in message listener', {
          [BoltAttributes.ERROR_MESSAGE]:
            err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private flushPendingMessages(): void {
    const pending = this.pendingMessages;
    this.pendingMessages = [];
    for (const envelope of pending) {
      this.injectEnvelope(envelope);
    }
  }

  private injectEnvelope(envelope: BridgeEnvelope): void {
    const webView = this.webViewRef.current;
    if (!webView) return;

    const json = JSON.stringify(envelope);
    // Call the global receiver function injected by the bridge
    const js = `window.__boltBridgeReceive(${JSON.stringify(json)});true;`;
    webView.injectJavaScript(js);
  }
}
