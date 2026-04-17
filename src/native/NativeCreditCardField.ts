import type { ViewProps } from 'react-native';
import type {
  DirectEventHandler,
  Float,
} from 'react-native/Libraries/Types/CodegenTypes';
import { codegenNativeComponent } from 'react-native';

interface OnErrorEvent {
  message: string;
}

export interface NativeProps extends ViewProps {
  publishableKey: string;
  showPostalCode?: boolean;
  // Style props (NativeCardFieldStyles flattened for codegen compatibility)
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
  onCardError: DirectEventHandler<OnErrorEvent>;
  onCardFocus: DirectEventHandler<{}>;
  onCardBlur: DirectEventHandler<{}>;
}

export default codegenNativeComponent<NativeProps>('BoltCreditCardField');
