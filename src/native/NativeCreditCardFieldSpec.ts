/**
 * Codegen spec for BoltCreditCardField.
 *
 * This file exists solely so that the React Native codegen generates
 * the C++ ComponentDescriptor, EventEmitter, and Props types.
 * The actual JS-side component registration is in NativeCreditCardField.ts
 * which uses NativeComponentRegistry.get() for bridgeless compatibility.
 *
 * DO NOT import this file at runtime — import NativeCreditCardField.ts instead.
 */
import type { ViewProps } from 'react-native';
import type {
  DirectEventHandler,
  Float,
} from 'react-native/Libraries/Types/CodegenTypes';
import { codegenNativeComponent } from 'react-native';

interface OnCardErrorEvent {
  message: string;
}

interface NativeProps extends ViewProps {
  publishableKey: string;
  showPostalCode?: boolean;
  // Style props (NativeCardFieldStyles flattened for codegen)
  styleTextColor?: string;
  styleFontSize?: Float;
  stylePlaceholderColor?: string;
  styleBorderColor?: string;
  styleBorderWidth?: Float;
  styleBorderRadius?: Float;
  styleBackgroundColor?: string;
  styleFontFamily?: string;
  // Events
  onCardValid: DirectEventHandler<{}>;
  onCardError: DirectEventHandler<OnCardErrorEvent>;
  onCardFocus: DirectEventHandler<{}>;
  onCardBlur: DirectEventHandler<{}>;
}

export default codegenNativeComponent<NativeProps>('BoltCreditCardField');
