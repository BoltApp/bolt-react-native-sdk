import { useThreeDSecure } from '../payments/useThreeDSecure';
import { ThreeDSError, threeDSErrorMap } from '../payments/types';

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

describe('ThreeDSError', () => {
  it('should be an instance of Error', () => {
    const error = new ThreeDSError(1001);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ThreeDSError);
  });

  it('should set code and message from error code map', () => {
    const error = new ThreeDSError(1001);
    expect(error.code).toBe(1001);
    expect(error.message).toBe(
      'Credit card id or credit card token must be supplied'
    );
  });

  it('should handle all defined error codes', () => {
    for (const [code, message] of threeDSErrorMap) {
      const error = new ThreeDSError(code);
      expect(error.code).toBe(code);
      expect(error.message).toBe(message);
    }
  });

  it('should handle unknown error codes with empty message', () => {
    const error = new ThreeDSError(9999);
    expect(error.code).toBe(9999);
    expect(error.message).toBe('');
  });
});
