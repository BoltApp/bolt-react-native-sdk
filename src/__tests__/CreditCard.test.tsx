import { Bolt } from '../client/Bolt';
import { CreditCard } from '../payments/CreditCard';
import type { Styles } from '../payments/types';

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

  it('should use staging URL when environment is staging', () => {
    const bolt = new Bolt({
      publishableKey: 'pk_test_123',
      environment: 'staging',
    });
    expect(bolt.baseUrl).toBe('https://connect-staging.bolt.com');
  });

  it('should throw when publishableKey is missing', () => {
    expect(() => new Bolt({ publishableKey: '' })).toThrow(
      'publishableKey is required'
    );
  });

  it('should have no onPageStyles by default', () => {
    const bolt = new Bolt({ publishableKey: 'pk_test_123' });
    expect(bolt.getOnPageStyles()).toBeUndefined();
  });

  it('should store and return onPageStyles', () => {
    const bolt = new Bolt({ publishableKey: 'pk_test_123' });
    const styles: Styles = {
      '--bolt-input-fontFamily': 'Inter, sans-serif',
      '--bolt-input-fontSize': '16px',
    };
    bolt.configureOnPageStyles(styles);
    expect(bolt.getOnPageStyles()).toEqual(styles);
  });

  it('should overwrite onPageStyles when called again', () => {
    const bolt = new Bolt({ publishableKey: 'pk_test_123' });
    bolt.configureOnPageStyles({
      '--bolt-input-fontFamily': 'Arial',
    });
    const newStyles: Styles = {
      '--bolt-input-fontFamily': 'Inter',
    };
    bolt.configureOnPageStyles(newStyles);
    expect(bolt.getOnPageStyles()).toEqual(newStyles);
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
