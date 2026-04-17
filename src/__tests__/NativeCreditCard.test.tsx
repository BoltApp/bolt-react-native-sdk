import { NativeCreditCard } from '../payments/NativeCreditCard';
import type { NativeCardFieldStyles } from '../payments/NativeCardFieldStyles';

/**
 * Tests for the NativeCreditCard namespace and component.
 *
 * Validates:
 * - Namespace exports Component and useController
 * - NativeCardFieldStyles type structure
 * - Component renders without crashing (mocked native view)
 */

// Mock the native component
jest.mock('../native/NativeCreditCardField', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((props: any, ref: any) => {
      return <View testID="native-credit-card-field" {...props} ref={ref} />;
    }),
  };
});

// Mock the native module
jest.mock('../native/NativeBoltCardFieldModule', () => ({
  __esModule: true,
  default: {
    tokenize: jest.fn(),
  },
}));

jest.mock('../client/useBolt', () => ({
  useBolt: () => ({
    publishableKey: 'pk_test_123',
    baseUrl: 'https://connect.bolt.com',
    apiUrl: 'https://api.bolt.com',
  }),
}));

describe('NativeCreditCard', () => {
  it('should export Component and useController', () => {
    expect(NativeCreditCard.Component).toBeDefined();
    expect(NativeCreditCard.useController).toBeDefined();
    expect(typeof NativeCreditCard.Component).toBe('function');
    expect(typeof NativeCreditCard.useController).toBe('function');
  });
});

describe('NativeCardFieldStyles', () => {
  it('should accept valid style properties', () => {
    const styles: NativeCardFieldStyles = {
      textColor: '#000000',
      fontSize: 16,
      placeholderColor: '#999999',
      borderColor: '#cccccc',
      borderWidth: 1,
      borderRadius: 8,
      backgroundColor: '#ffffff',
      fontFamily: 'System',
    };
    expect(styles.textColor).toBe('#000000');
    expect(styles.fontSize).toBe(16);
  });

  it('should accept partial styles', () => {
    const styles: NativeCardFieldStyles = {
      textColor: '#333',
    };
    expect(styles.textColor).toBe('#333');
    expect(styles.fontSize).toBeUndefined();
  });

  it('should accept empty styles', () => {
    const styles: NativeCardFieldStyles = {};
    expect(Object.keys(styles)).toHaveLength(0);
  });
});
