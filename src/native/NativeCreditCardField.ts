import type { ViewProps, HostComponent } from 'react-native';
import type { DirectEventHandler } from 'react-native/Libraries/Types/CodegenTypes';
const { NativeComponentRegistry } = require('react-native');

interface OnErrorEvent {
  message: string;
}

export interface NativeProps extends ViewProps {
  publishableKey: string;
  showPostalCode?: boolean;
  // Style props (NativeCardFieldStyles flattened for codegen compatibility)
  styleTextColor?: string;
  styleFontSize?: number;
  stylePlaceholderColor?: string;
  styleBorderColor?: string;
  styleBorderWidth?: number;
  styleBorderRadius?: number;
  styleBackgroundColor?: string;
  styleFontFamily?: string;
  // Events
  onCardValid: DirectEventHandler<{}>;
  onCardError: DirectEventHandler<OnErrorEvent>;
  onCardFocus: DirectEventHandler<{}>;
  onCardBlur: DirectEventHandler<{}>;
}

/**
 * Fabric NativeComponent for the credit card input.
 *
 * In bridgeless mode, codegenNativeComponent requires the Babel codegen
 * transform to run. Since the transform may not process library source
 * files in all Metro configurations, we register the component directly
 * with NativeComponentRegistry using the static view config that codegen
 * would have generated.
 */
const NativeCreditCardField: HostComponent<NativeProps> = (
  NativeComponentRegistry.get as Function
)('BoltCreditCardField', () => ({
  uiViewClassName: 'BoltCreditCardField',
  bubblingEventTypes: {},
  directEventTypes: {
    topCardValid: {
      registrationName: 'onCardValid',
    },
    topCardError: {
      registrationName: 'onCardError',
    },
    topCardFocus: {
      registrationName: 'onCardFocus',
    },
    topCardBlur: {
      registrationName: 'onCardBlur',
    },
  },
  validAttributes: {
    publishableKey: true,
    showPostalCode: true,
    styleTextColor: true,
    styleFontSize: true,
    stylePlaceholderColor: true,
    styleBorderColor: true,
    styleBorderWidth: true,
    styleBorderRadius: true,
    styleBackgroundColor: true,
    styleFontFamily: true,
  },
}));

export default NativeCreditCardField;
