import { NativeCreditCardComponent } from './NativeCreditCardComponent';
import { useNativeCreditCardController } from './useNativeCreditCardController';

/**
 * NativeCreditCard namespace — mirrors the CreditCard namespace API shape.
 *
 * Uses platform-native text fields (UITextField / EditText) instead of WebView.
 * CHD never enters the JavaScript heap.
 *
 * Usage:
 *   const cc = NativeCreditCard.useController()
 *   <NativeCreditCard.Component controller={cc} />
 *   cc.on('valid', () => setCanSubmit(true))
 *   const result = await cc.tokenize()
 */
export const NativeCreditCard = {
  Component: NativeCreditCardComponent,
  useController: useNativeCreditCardController,
};
