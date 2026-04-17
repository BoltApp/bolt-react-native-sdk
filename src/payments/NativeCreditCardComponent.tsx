import React, { useCallback } from 'react';
import type { ViewStyle, StyleProp } from 'react-native';
import NativeCreditCardField from '../native/NativeCreditCardField';
import { useBolt } from '../client/useBolt';
import type { NativeCreditCardController } from './useNativeCreditCardController';

export interface NativeCreditCardComponentProps {
  controller: NativeCreditCardController;
  showPostalCode?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Native credit card input component.
 *
 * Renders platform-native text fields (UITextField on iOS, EditText on Android)
 * for PAN, expiry, CVV, and optional postal code.
 *
 * CHD never enters the JavaScript heap — the JS layer only receives
 * tokenization results via the controller's tokenize() method.
 */
export const NativeCreditCardComponent: React.FC<
  NativeCreditCardComponentProps
> = ({ controller, showPostalCode = false, style }) => {
  const bolt = useBolt();
  const listeners = controller._listenersRef;
  const lastState = controller._lastStateRef;

  const handleValid = useCallback(() => {
    lastState.current = 'valid';
    (listeners.current.valid as (() => void) | undefined)?.();
  }, [listeners, lastState]);

  const handleError = useCallback(
    (event: { nativeEvent: { message: string } }) => {
      const message = event.nativeEvent.message;
      lastState.current = { error: message };
      (listeners.current.error as ((e: string) => void) | undefined)?.(message);
    },
    [listeners, lastState]
  );

  const handleFocus = useCallback(() => {
    (listeners.current.focus as (() => void) | undefined)?.();
  }, [listeners]);

  const handleBlur = useCallback(() => {
    (listeners.current.blur as (() => void) | undefined)?.();
  }, [listeners]);

  const fieldStyles = controller._stylesRef?.current;

  return (
    <NativeCreditCardField
      ref={controller.nativeRef}
      publishableKey={bolt.publishableKey}
      showPostalCode={showPostalCode}
      styleTextColor={fieldStyles?.textColor}
      styleFontSize={fieldStyles?.fontSize}
      stylePlaceholderColor={fieldStyles?.placeholderColor}
      styleBorderColor={fieldStyles?.borderColor}
      styleBorderWidth={fieldStyles?.borderWidth}
      styleBorderRadius={fieldStyles?.borderRadius}
      styleBackgroundColor={fieldStyles?.backgroundColor}
      styleFontFamily={fieldStyles?.fontFamily}
      onCardValid={handleValid}
      onCardError={handleError}
      onCardFocus={handleFocus}
      onCardBlur={handleBlur}
      style={style}
    />
  );
};
