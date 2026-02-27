import { useThreeDSecure } from '../payments/useThreeDSecure';

// Mock react-native-webview
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: React.forwardRef((props: any, ref: any) => {
      return <View testID="webview" {...props} ref={ref} />;
    }),
  };
});

describe('useThreeDSecure', () => {
  it('should be a function', () => {
    expect(typeof useThreeDSecure).toBe('function');
  });
});
