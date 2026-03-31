import type { ViewProps } from 'react-native';
import type {
  BubblingEventHandler,
  Float,
} from 'react-native/Libraries/Types/CodegenTypes';
import { codegenNativeComponent } from 'react-native';

interface NativeProps extends ViewProps {
  buttonType: string;
  buttonTheme?: string;
  borderRadius?: Float;
  onPress: BubblingEventHandler<{}>;
}

export default codegenNativeComponent<NativeProps>('BoltGooglePayButton');
