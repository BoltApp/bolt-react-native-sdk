import { Bolt } from '../client/Bolt';
import { CreditCard } from '../payments/CreditCard';

// Mock react-native-webview
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((props: any, ref: any) => {
      return <View testID="webview" {...props} ref={ref} />;
    }),
    WebView: React.forwardRef((props: any, ref: any) => {
      return <View testID="webview" {...props} ref={ref} />;
    }),
  };
});

describe('Bolt', () => {
  it('should create a Bolt instance with publishableKey', () => {
    const bolt = new Bolt({ publishableKey: 'pk_test_123' });
    expect(bolt.publishableKey).toBe('pk_test_123');
    expect(bolt.baseUrl).toBe('https://connect.bolt.com');
    expect(bolt.language).toBe('en');
  });

  it('should use sandbox URL when environment is sandbox', () => {
    const bolt = new Bolt({
      publishableKey: 'pk_test_123',
      environment: 'sandbox',
    });
    expect(bolt.baseUrl).toBe('https://connect-sandbox.bolt.com');
  });

  it('should throw when publishableKey is missing', () => {
    expect(() => new Bolt({ publishableKey: '' })).toThrow(
      'publishableKey is required'
    );
  });
});

describe('CreditCard', () => {
  it('should export Component and useController', () => {
    expect(CreditCard.Component).toBeDefined();
    expect(CreditCard.useController).toBeDefined();
    expect(typeof CreditCard.Component).toBe('function');
    expect(typeof CreditCard.useController).toBe('function');
  });
});
