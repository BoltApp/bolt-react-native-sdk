/**
 * JavaScript string injected into WebViews via `injectedJavaScriptBeforeContentLoaded`.
 * Runs before Bolt's iframe code loads, patching the environment so the WebView
 * behaves like an iframe hosted by a parent window.
 *
 * What it patches:
 * 1. window.parent — returns a fake Window whose postMessage() routes through RN bridge
 * 2. window.addEventListener('message') — intercepts to inject correct event.origin
 * 3. isIframe() detection — ensures window.location !== window.parent.location returns true
 * 4. Virtual MessagePort — emulates MessageChannel/MessagePort for RPC channels
 *
 * Envelope format for bridge messages:
 * {
 *   __boltBridge: true,
 *   direction: 'inbound' | 'outbound',
 *   type: 'postMessage' | 'portMessage' | 'bridgeReady',
 *   data?: unknown,
 *   virtualPortId?: string,
 * }
 *
 * CRITICAL: Bolt's serialization layer (libs/base/messaging/Serialization.ts) sends
 * JSON strings, not objects. The bridge must preserve this — data payloads within
 * envelopes are JSON strings when coming from Bolt code.
 */
export const INJECTED_BRIDGE_JS = `
(function() {
  'use strict';

  // Only install the bridge in the top-level WebView frame.
  // Bolt's credit-card-input loads sub-iframes for each field (PCI compliance).
  // Those sub-frames must communicate with their real parent (the main frame),
  // not with React Native. Check BEFORE we patch window.parent.
  if (window.parent !== window) return;

  // Guard against double-injection
  if (window.__boltBridgeInitialized) return;
  window.__boltBridgeInitialized = true;

  var BOLT_ORIGIN = window.location.origin;
  var virtualPorts = {};
  var pendingMessages = [];
  var bridgeReady = false;

  // ── Helpers ──────────────────────────────────────────────

  function sendToNative(envelope) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(envelope));
    }
  }

  function createEnvelope(type, data, virtualPortId) {
    return {
      __boltBridge: true,
      direction: 'outbound',
      type: type,
      data: data,
      virtualPortId: virtualPortId || undefined
    };
  }

  // ── Virtual MessagePort ──────────────────────────────────

  function VirtualMessagePort(portId) {
    this.portId = portId;
    this.onmessage = null;
    this._started = false;
    this._queue = [];
    virtualPorts[portId] = this;
  }

  VirtualMessagePort.prototype.postMessage = function(data) {
    sendToNative(createEnvelope('portMessage', data, this.portId));
  };

  VirtualMessagePort.prototype.start = function() {
    this._started = true;
    // Flush queued messages
    var queue = this._queue;
    this._queue = [];
    for (var i = 0; i < queue.length; i++) {
      this._dispatchMessage(queue[i]);
    }
  };

  VirtualMessagePort.prototype.close = function() {
    delete virtualPorts[this.portId];
  };

  VirtualMessagePort.prototype._dispatchMessage = function(data) {
    if (this.onmessage) {
      this.onmessage({ data: data, origin: BOLT_ORIGIN, source: null });
    }
  };

  VirtualMessagePort.prototype._receive = function(data) {
    if (this._started) {
      this._dispatchMessage(data);
    } else {
      this._queue.push(data);
    }
  };

  // ── Fake parent window ───────────────────────────────────

  var fakeParentLocation = { href: 'https://merchant-app.example.com', origin: 'https://merchant-app.example.com' };

  var fakeParent = {
    postMessage: function(data, targetOrigin, transfer) {
      var envelope = createEnvelope('postMessage', data);

      // If a MessagePort is being transferred, create a virtual port
      if (transfer && transfer.length > 0) {
        var portId = 'vp_' + Math.random().toString(36).substr(2, 9);
        var vPort = new VirtualMessagePort(portId);
        envelope.virtualPortId = portId;
        // The transfer array in the real API would contain MessagePort objects.
        // We replace them with virtual ports so the iframe code can use them.
        // Store reference so the iframe's port variable points to our virtual port.
        if (transfer[0] && typeof transfer[0] === 'object') {
          // Copy virtual port methods onto the transferred port object
          transfer[0].__virtualPortId = portId;
        }
      }

      sendToNative(envelope);
    },
    location: fakeParentLocation,
    // The parent should look like a Window
    window: undefined, // will be set below
    document: { referrer: '' },
    frames: [],
    length: 0,
    closed: false,
    opener: null,
    self: undefined // will be set below
  };
  fakeParent.window = fakeParent;
  fakeParent.self = fakeParent;

  // ── Patch window.parent ──────────────────────────────────
  // libs/base/utils/Parent.ts checks window.location !== window.parent.location
  // to determine isIframe(). We need this to return true.

  try {
    Object.defineProperty(window, 'parent', {
      get: function() { return fakeParent; },
      configurable: true
    });
  } catch (e) {
    // Fallback: if defineProperty fails (some WebView engines), set directly
    window.parent = fakeParent;
  }

  // ── Patch addEventListener('message') ────────────────────
  // Bolt's Listener.ts validates event.origin. We intercept message handlers
  // to create synthetic MessageEvents with the correct origin.

  var originalAddEventListener = window.addEventListener.bind(window);
  var originalRemoveEventListener = window.removeEventListener.bind(window);
  var messageListeners = [];

  window.addEventListener = function(type, listener, options) {
    if (type === 'message' && typeof listener === 'function') {
      // Prevent duplicate registrations of the same listener
      if (messageListeners.indexOf(listener) === -1) {
        messageListeners.push(listener);
      }
      return;
    }
    return originalAddEventListener(type, listener, options);
  };

  window.removeEventListener = function(type, listener, options) {
    if (type === 'message' && typeof listener === 'function') {
      var idx = messageListeners.indexOf(listener);
      if (idx !== -1) {
        messageListeners.splice(idx, 1);
      }
      return;
    }
    return originalRemoveEventListener(type, listener, options);
  };

  // Dispatch a synthetic message event to all registered listeners
  function dispatchBridgeMessage(data, ports) {
    var event = {
      data: data,
      origin: BOLT_ORIGIN,
      source: fakeParent,
      ports: ports || [],
      isTrusted: true,
      type: 'message',
      // Minimal Event interface
      preventDefault: function() {},
      stopPropagation: function() {},
      stopImmediatePropagation: function() {}
    };

    for (var i = 0; i < messageListeners.length; i++) {
      try {
        messageListeners[i](event);
      } catch (err) {
        console.error('[BoltBridge] Error in message listener:', err);
      }
    }
  }

  // ── Receive messages from React Native ───────────────────

  // React Native sends messages by evaluating JS on the WebView.
  // We expose a global function the native side calls.
  window.__boltBridgeReceive = function(envelopeStr) {
    try {
      var envelope = typeof envelopeStr === 'string' ? JSON.parse(envelopeStr) : envelopeStr;

      if (!envelope || !envelope.__boltBridge) return;

      if (envelope.type === 'postMessage') {
        var ports = [];
        if (envelope.virtualPortId) {
          var port = virtualPorts[envelope.virtualPortId] || new VirtualMessagePort(envelope.virtualPortId);
          ports.push(port);
        }
        dispatchBridgeMessage(envelope.data, ports);
      } else if (envelope.type === 'portMessage' && envelope.virtualPortId) {
        var targetPort = virtualPorts[envelope.virtualPortId];
        if (targetPort) {
          targetPort._receive(envelope.data);
        }
      }
    } catch (err) {
      console.error('[BoltBridge] Error receiving message:', err);
    }
  };

  // ── Signal bridge ready ──────────────────────────────────
  // Since this script runs via injectedJavaScriptBeforeContentLoaded, we
  // wait for DOMContentLoaded so Bolt's iframe code has loaded and
  // registered its message listeners before we flush any queued messages.

  function signalReady() {
    if (bridgeReady) return;
    bridgeReady = true;
    sendToNative(createEnvelope('bridgeReady', null));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', signalReady);
  } else {
    signalReady();
  }
})();
true; // Required for injectedJavaScriptBeforeContentLoaded
`;
