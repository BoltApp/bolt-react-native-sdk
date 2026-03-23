import type { ViewProps } from 'react-native';
import type { BubblingEventHandler } from 'react-native/Libraries/Types/CodegenTypes';
import { codegenNativeComponent } from 'react-native';

interface NativeProps extends ViewProps {
  buttonType: string;
  buttonStyle: string;
  onPress: BubblingEventHandler<{}>;
}

export default codegenNativeComponent<NativeProps>('BoltApplePayButton');
