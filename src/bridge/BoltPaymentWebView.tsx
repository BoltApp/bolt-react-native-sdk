import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useCallback,
  useState,
} from 'react';
import type { MutableRefObject } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { INJECTED_BRIDGE_JS } from './injectedBridge';
import { BoltBridgeDispatcher } from './BoltBridgeDispatcher';
import { buildIframeUrl } from './buildIframeUrl';
import { useBolt } from '../client/BoltProvider';

export interface BoltPaymentWebViewProps {
  element: string;
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

  // Wire dispatcher to the WebView ref
  // The dispatcher needs the ref to inject JS back into the WebView
  const setWebViewRefOnDispatcher = useCallback(
    (node: WebView | null) => {
      (webViewRef as MutableRefObject<WebView | null>).current = node;
      // Update the dispatcher's internal ref to point to this WebView
      (
        dispatcher as unknown as { webViewRef: { current: WebView | null } }
      ).webViewRef.current = node;
    },
    [dispatcher]
  );

  const uri = buildIframeUrl({
    baseUrl: bolt.baseUrl,
    element,
    publishableKey: bolt.publishableKey,
    language: bolt.language,
  });

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      dispatcher.handleMessage(event);

      // Handle height change messages from the iframe
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (
          typeof data === 'object' &&
          data !== null &&
          !('__boltBridge' in data)
        ) {
          // Check for SetIFrameHeight message (may be double-serialized)
          let msg = data;
          if (typeof msg === 'string') {
            try {
              msg = JSON.parse(msg);
            } catch {
              // not double-serialized
            }
          }
          if (
            msg?.type === 'SetIFrameHeight' &&
            typeof msg.height === 'number'
          ) {
            setWebViewHeight(msg.height);
            onHeightChange?.(msg.height);
          }
        }
      } catch {
        // Not JSON, ignore for height handling
      }
    },
    [dispatcher, onHeightChange]
  );

  const handleShouldStartLoad = useCallback(
    (request: ShouldStartLoadRequest): boolean => {
      // Only allow navigation within the Bolt domain
      return (
        request.url.startsWith(bolt.baseUrl) || request.url === 'about:blank'
      );
    },
    [bolt.baseUrl]
  );

  return (
    <WebView
      ref={setWebViewRefOnDispatcher}
      source={{ uri }}
      injectedJavaScriptBeforeContentLoaded={INJECTED_BRIDGE_JS}
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
  },
});
