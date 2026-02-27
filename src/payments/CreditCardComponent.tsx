import { useRef } from 'react';
import type { ViewStyle } from 'react-native';
import {
  BoltPaymentWebView,
  type BoltPaymentWebViewHandle,
} from '../bridge/BoltPaymentWebView';
import type { CreditCardController } from './useCreditCardController';

export interface CreditCardComponentProps {
  controller: CreditCardController;
  style?: ViewStyle;
}

/**
 * Renders the Bolt credit card input WebView.
 */
export const CreditCardComponent = ({
  controller,
  style,
}: CreditCardComponentProps) => {
  const webViewHandleRef = useRef<BoltPaymentWebViewHandle>(null);

  return (
    <BoltPaymentWebView
      ref={webViewHandleRef}
      element="credit-card-input"
      dispatcher={controller._dispatcher}
      style={style}
    />
  );
};
