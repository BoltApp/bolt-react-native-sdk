import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { useBolt } from '../client/useBolt';
import { BoltBridgeDispatcher } from './BoltBridgeDispatcher';
import { buildIframeUrl } from './buildIframeUrl';
import { INJECTED_BRIDGE_JS } from './injectedBridge';

/**
 * Bolt iframe element names supported in React Native.
 * The storm embedded SDK has additional elements (authorization, login-status,
 * payment-selector, etc.) that are out of scope for the initial release.
 */
export type BoltElementName =
  | 'credit-card-input'
  | '3d-secure'
  | 'add-card-from-apple-wallet';

export interface BoltPaymentWebViewProps {
  element: BoltElementName;
  dispatcher: BoltBridgeDispatcher;
  style?: ViewStyle;
  onHeightChange?: (height: number) => void;
}

export interface BoltPaymentWebViewHandle {
  dispatcher: BoltBridgeDispatcher;
  reload: () => void;
}

/**
 * Shared WebView wrapper used by CreditCard and 3DS components.
 * Loads a Bolt iframe element with the injected bridge JS.
 */
export const BoltPaymentWebView = forwardRef<
  BoltPaymentWebViewHandle,
  BoltPaymentWebViewProps
>(function BoltPaymentWebView(
  { element, dispatcher, style, onHeightChange },
  ref
) {
  const bolt = useBolt();
  const webViewRef = useRef<WebView>(null);
  const [webViewHeight, setWebViewHeight] = useState(200);

  // Expose handle to parent
  useImperativeHandle(
    ref,
    () => ({
      dispatcher,
      reload: () => webViewRef.current?.reload(),
    }),
    [dispatcher]
  );

  // Wire dispatcher to the WebView ref so it can inject JS back into the WebView
  const webViewRefCallback = useCallback(
    (node: WebView | null) => {
      webViewRef.current = node;
      dispatcher.setWebView(node);
    },
    [dispatcher]
  );

  const uri = useMemo(
    () =>
      buildIframeUrl({
        baseUrl: bolt.baseUrl,
        element,
        publishableKey: bolt.publishableKey,
        language: bolt.language,
      }),
    [bolt.baseUrl, bolt.publishableKey, bolt.language, element]
  );

  const tryExtractHeight = useCallback(
    (raw: unknown) => {
      // Unwrap double-serialized strings
      let msg = raw;
      if (typeof msg === 'string') {
        try {
          msg = JSON.parse(msg);
        } catch {
          return;
        }
      }
      if (
        typeof msg === 'object' &&
        msg !== null &&
        (msg as Record<string, unknown>).type === 'SetIFrameHeight' &&
        typeof (msg as Record<string, unknown>).height === 'number'
      ) {
        const height = (msg as { height: number }).height;
        setWebViewHeight(height);
        onHeightChange?.(height);
      }
    },
    [onHeightChange]
  );

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      dispatcher.handleMessage(event);

      // Handle height change messages from the iframe.
      // SetIFrameHeight may arrive as a raw message OR wrapped in a bridge
      // envelope (window.parent.postMessage goes through the injected bridge).
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (
          typeof data === 'object' &&
          data !== null &&
          '__boltBridge' in data
        ) {
          // Bridge envelope — check the inner data payload
          tryExtractHeight((data as { data?: unknown }).data);
        } else {
          // Raw message (non-bridge)
          tryExtractHeight(data);
        }
      } catch {
        // Not JSON, ignore for height handling
      }
    },
    [dispatcher, tryExtractHeight]
  );

  const handleShouldStartLoad = useCallback(
    (request: ShouldStartLoadRequest): boolean => {
      // Allow all sub-frame navigations (e.g., Cardinal Commerce DDC form
      // submission, 3DS step-up challenge iframe)
      if (request.isTopFrame === false) return true;
      // Only restrict top-level navigation to the Bolt domain
      return (
        request.url.startsWith(bolt.baseUrl) || request.url === 'about:blank'
      );
    },
    [bolt.baseUrl]
  );

  return (
    <WebView
      ref={webViewRefCallback}
      source={{ uri }}
      injectedJavaScriptBeforeContentLoaded={INJECTED_BRIDGE_JS}
      injectedJavaScriptBeforeContentLoadedForMainFrameOnly={true}
      onMessage={handleMessage}
      originWhitelist={['https://*']}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      scrollEnabled={false}
      keyboardDisplayRequiresUserAction={false}
      onShouldStartLoadWithRequest={handleShouldStartLoad}
      style={[styles.webView, { height: webViewHeight }, style]}
    />
  );
});

const styles = StyleSheet.create({
  webView: {
    backgroundColor: 'transparent',
    width: '100%',
    overflow: 'hidden',
  },
});
