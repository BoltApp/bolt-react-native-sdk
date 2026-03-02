import { Bolt } from '../client/Bolt';
import { BoltProvider } from '../client/BoltProvider';
import { useBolt } from '../client/useBolt';
import {
  CreditCard,
  useThreeDSecure,
  ThreeDSError,
  threeDSErrorMap,
} from '../payments';

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

describe('Root exports', () => {
  it('should export Bolt class', () => {
    expect(Bolt).toBeDefined();
    expect(typeof Bolt).toBe('function');
  });

  it('should export BoltProvider', () => {
    expect(BoltProvider).toBeDefined();
    expect(typeof BoltProvider).toBe('function');
  });

  it('should export useBolt hook', () => {
    expect(useBolt).toBeDefined();
    expect(typeof useBolt).toBe('function');
  });
});

describe('Payments exports', () => {
  it('should export CreditCard namespace', () => {
    expect(CreditCard).toBeDefined();
    expect(CreditCard.Component).toBeDefined();
    expect(CreditCard.useController).toBeDefined();
  });

  it('should export useThreeDSecure hook', () => {
    expect(useThreeDSecure).toBeDefined();
    expect(typeof useThreeDSecure).toBe('function');
  });

  it('should export ThreeDSError class', () => {
    expect(ThreeDSError).toBeDefined();
    const err = new ThreeDSError(1008);
    expect(err.code).toBe(1008);
    expect(err.message).toBe('Authentication failed');
  });

  it('should export threeDSErrorMap', () => {
    expect(threeDSErrorMap).toBeDefined();
    expect(threeDSErrorMap.size).toBe(10);
  });
});
