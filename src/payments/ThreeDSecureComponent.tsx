import { useRef } from 'react';
import type { ViewStyle } from 'react-native';
import {
  BoltPaymentWebView,
  type BoltPaymentWebViewHandle,
} from '../bridge/BoltPaymentWebView';
import type { BoltBridgeDispatcher } from '../bridge/BoltBridgeDispatcher';

export interface ThreeDSecureComponentProps {
  dispatcher: BoltBridgeDispatcher;
  style?: ViewStyle;
}

/**
 * Renders the Bolt 3D Secure WebView. Should be mounted in the component tree
 * (even if hidden) for device data collection to work.
 */
export const ThreeDSecureComponent = ({
  dispatcher,
  style,
}: ThreeDSecureComponentProps) => {
  const webViewHandleRef = useRef<BoltPaymentWebViewHandle>(null);

  return (
    <BoltPaymentWebView
      ref={webViewHandleRef}
      element="3d-secure"
      dispatcher={dispatcher}
      style={style}
    />
  );
};
