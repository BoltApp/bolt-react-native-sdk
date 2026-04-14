import { render } from '@testing-library/react-native';
import { NativeCreditCardComponent } from '../payments/NativeCreditCardComponent';
import type { NativeCreditCardController } from '../payments/useNativeCreditCardController';

/**
 * Tests for NativeCreditCardComponent.
 *
 * Validates:
 * - Component renders the native view
 * - Props are passed through (publishableKey, showPostalCode)
 * - Event handlers are wired from controller listeners
 * - Default showPostalCode is false
 */

jest.mock('../native/NativeCreditCardField', () => {
  const RN = require('react-native');
  return {
    __esModule: true,
    default: RN.requireNativeComponent('BoltCreditCardField'),
  };
});

jest.mock('../client/useBolt', () => ({
  useBolt: () => ({
    publishableKey: 'pk_test_456',
    baseUrl: 'https://connect-sandbox.bolt.com',
    apiUrl: 'https://api-sandbox.bolt.com',
  }),
}));

const makeController = (
  overrides?: Partial<NativeCreditCardController>
): NativeCreditCardController => {
  return {
    nativeRef: { current: null },
    _listenersRef: { current: {} },
    _stylesRef: { current: undefined },
    on: jest.fn(),
    tokenize: jest.fn().mockResolvedValue({ token: 'test' }),
    setStyles: jest.fn(),
    ...overrides,
  };
};

describe('NativeCreditCardComponent', () => {
  it('should render without crashing', () => {
    const controller = makeController();
    const { toJSON } = render(
      <NativeCreditCardComponent controller={controller} />
    );
    expect(toJSON()).toBeTruthy();
  });

  it('should pass showPostalCode prop (default false)', () => {
    const controller = makeController();
    const { toJSON } = render(
      <NativeCreditCardComponent controller={controller} />
    );
    const tree = toJSON() as any;
    expect(tree.props.showPostalCode).toBe(false);
  });

  it('should pass showPostalCode=true when specified', () => {
    const controller = makeController();
    const { toJSON } = render(
      <NativeCreditCardComponent
        controller={controller}
        showPostalCode={true}
      />
    );
    const tree = toJSON() as any;
    expect(tree.props.showPostalCode).toBe(true);
  });

  it('should pass publishableKey from Bolt client', () => {
    const controller = makeController();
    const { toJSON } = render(
      <NativeCreditCardComponent controller={controller} />
    );
    const tree = toJSON() as any;
    expect(tree.props.publishableKey).toBe('pk_test_456');
  });

  it('should forward valid event to controller listener', () => {
    const validCb = jest.fn();
    const controller = makeController({
      _listenersRef: { current: { valid: validCb } },
    });
    const { toJSON } = render(
      <NativeCreditCardComponent controller={controller} />
    );
    const tree = toJSON() as any;
    // Simulate the native event
    tree.props.onCardValid();
    expect(validCb).toHaveBeenCalledTimes(1);
  });

  it('should forward error event with message', () => {
    const errorCb = jest.fn();
    const controller = makeController({
      _listenersRef: { current: { error: errorCb } },
    });
    const { toJSON } = render(
      <NativeCreditCardComponent controller={controller} />
    );
    const tree = toJSON() as any;
    tree.props.onCardError({ nativeEvent: { message: 'Invalid card' } });
    expect(errorCb).toHaveBeenCalledWith('Invalid card');
  });

  it('should forward focus event', () => {
    const focusCb = jest.fn();
    const controller = makeController({
      _listenersRef: { current: { focus: focusCb } },
    });
    const { toJSON } = render(
      <NativeCreditCardComponent controller={controller} />
    );
    const tree = toJSON() as any;
    tree.props.onCardFocus();
    expect(focusCb).toHaveBeenCalledTimes(1);
  });

  it('should forward blur event', () => {
    const blurCb = jest.fn();
    const controller = makeController({
      _listenersRef: { current: { blur: blurCb } },
    });
    const { toJSON } = render(
      <NativeCreditCardComponent controller={controller} />
    );
    const tree = toJSON() as any;
    tree.props.onCardBlur();
    expect(blurCb).toHaveBeenCalledTimes(1);
  });

  it('should not crash when event fires with no listener registered', () => {
    const controller = makeController();
    const { toJSON } = render(
      <NativeCreditCardComponent controller={controller} />
    );
    const tree = toJSON() as any;
    expect(() => tree.props.onCardValid()).not.toThrow();
    expect(() => tree.props.onCardBlur()).not.toThrow();
    expect(() =>
      tree.props.onCardError({ nativeEvent: { message: 'err' } })
    ).not.toThrow();
  });

  it('should apply custom style', () => {
    const controller = makeController();
    const { toJSON } = render(
      <NativeCreditCardComponent
        controller={controller}
        style={{ height: 200 }}
      />
    );
    const tree = toJSON() as any;
    expect(tree.props.style).toEqual({ height: 200 });
  });
});
