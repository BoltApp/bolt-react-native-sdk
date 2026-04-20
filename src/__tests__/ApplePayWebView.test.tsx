import { act, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { ApplePayWebView } from '../payments/ApplePayWebView';

/**
 * Regression tests for ApplePayWebView's dispatcher subscription.
 *
 * The bug being guarded: handleMessage previously parsed the raw bridge
 * envelope directly, so msg.type was always 'postMessage' and the
 * addCardFromApplePaySuccess/Error branches were unreachable. Tokens were
 * silently dropped after a successful Apple Pay authorization.
 */

// The iframe posts messages via window.parent.postMessage, which our injected
// bridge wraps as `{ __boltBridge, direction:'outbound', type:'postMessage',
// data: <serialized bolt msg> }`. These tests deliver exactly that envelope
// through the WebView's onMessage prop.
const makeEnvelope = (boltMessage: unknown) => ({
  nativeEvent: {
    data: JSON.stringify({
      __boltBridge: true,
      direction: 'outbound',
      type: 'postMessage',
      data: JSON.stringify(boltMessage),
    }),
  },
});

const mockCanMakePayments = jest.fn<Promise<boolean>, []>();

jest.mock('../native/NativeApplePay', () => ({
  __esModule: true,
  default: {
    canMakePayments: () => mockCanMakePayments(),
    requestPayment: jest.fn(),
  },
}));

jest.mock('../client/useBolt', () => ({
  useBolt: () => ({
    publishableKey: 'pk_test_123',
    baseUrl: 'https://connect.bolt.com',
    language: 'en',
  }),
}));

const mockSpan = {
  setStatus: jest.fn(),
  recordException: jest.fn(),
  setAttribute: jest.fn(),
  end: jest.fn(),
};

jest.mock('../telemetry/tracer', () => ({
  startSpan: () => mockSpan,
  SpanStatusCode: { OK: 1, ERROR: 2 },
}));

// Render the WebView as a plain host view so tree traversal can reach its
// onMessage prop. Any inline JS / native config is irrelevant here.
jest.mock('react-native-webview', () => {
  const React = require('react');
  const RN = require('react-native');
  const MockWebView = React.forwardRef(
    (props: Record<string, unknown>, ref: unknown) => {
      React.useImperativeHandle(ref, () => ({
        injectJavaScript: jest.fn(),
        reload: jest.fn(),
      }));
      return React.createElement(RN.View, { ...props, testID: 'mock-webview' });
    }
  );
  return { __esModule: true, default: MockWebView };
});

const baseConfig = {
  countryCode: 'US',
  currencyCode: 'USD',
  total: { label: 'Test', amount: '0.00' },
};

const findWebView = (toJSON: () => unknown) => {
  const tree = toJSON() as { props: Record<string, unknown> } | null;
  if (!tree) throw new Error('component rendered null');
  return tree;
};

describe('ApplePayWebView — envelope unwrapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as { OS: string }).OS = 'ios';
    mockCanMakePayments.mockResolvedValue(true);
  });

  it('calls onComplete when a success envelope arrives from the iframe', async () => {
    const onComplete = jest.fn();
    const onError = jest.fn();

    const { toJSON } = render(
      <ApplePayWebView
        config={baseConfig}
        onComplete={onComplete}
        onError={onError}
      />
    );

    await waitFor(() => expect(findWebView(toJSON)).toBeTruthy());

    const webView = findWebView(toJSON);
    act(() => {
      (webView.props.onMessage as (e: unknown) => void)(
        makeEnvelope({
          type: 'addCardFromApplePaySuccess',
          message: {
            token: {
              token: 'tok_apple_123',
              bin: '411111',
              expiration: '2027-12',
            },
            billingContact: {
              givenName: 'Jane',
              familyName: 'Doe',
              emailAddress: 'jane@example.com',
            },
            boltReference: 'ref_abc',
          },
        })
      );
    });

    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith({
      token: 'tok_apple_123',
      bin: '411111',
      expiration: '2027-12',
      boltReference: 'ref_abc',
      billingContact: {
        givenName: 'Jane',
        familyName: 'Doe',
        emailAddress: 'jane@example.com',
        phoneNumber: undefined,
        postalAddress: undefined,
      },
    });
  });

  it('routes a generic error envelope to onError', async () => {
    const onComplete = jest.fn();
    const onError = jest.fn();

    const { toJSON } = render(
      <ApplePayWebView
        config={baseConfig}
        onComplete={onComplete}
        onError={onError}
      />
    );

    await waitFor(() => expect(findWebView(toJSON)).toBeTruthy());

    act(() => {
      (findWebView(toJSON).props.onMessage as (e: unknown) => void)(
        makeEnvelope({
          type: 'addCardFromApplePayError',
          message: { errorCode: 1004, message: 'Request Error' },
        })
      );
    });

    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe('Request Error');
  });

  it('swallows user-cancel (1006) without calling onError or onComplete', async () => {
    const onComplete = jest.fn();
    const onError = jest.fn();

    const { toJSON } = render(
      <ApplePayWebView
        config={baseConfig}
        onComplete={onComplete}
        onError={onError}
      />
    );

    await waitFor(() => expect(findWebView(toJSON)).toBeTruthy());

    act(() => {
      (findWebView(toJSON).props.onMessage as (e: unknown) => void)(
        makeEnvelope({
          type: 'addCardFromApplePayError',
          message: { errorCode: 1006 },
        })
      );
    });

    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports an error instead of resolving with an empty token', async () => {
    const onComplete = jest.fn();
    const onError = jest.fn();

    const { toJSON } = render(
      <ApplePayWebView
        config={baseConfig}
        onComplete={onComplete}
        onError={onError}
      />
    );

    await waitFor(() => expect(findWebView(toJSON)).toBeTruthy());

    act(() => {
      (findWebView(toJSON).props.onMessage as (e: unknown) => void)(
        makeEnvelope({
          type: 'addCardFromApplePaySuccess',
          message: {
            token: {},
            boltReference: 'ref_abc',
          },
        })
      );
    });

    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect((onError.mock.calls[0]?.[0] as Error).message).toMatch(
      /missing a token/i
    );
  });
});
