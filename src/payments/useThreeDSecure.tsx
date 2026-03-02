import { useRef, useMemo, useCallback } from 'react';
import type { ViewStyle } from 'react-native';
import { BoltBridgeDispatcher } from '../bridge/BoltBridgeDispatcher';
import { parseBoltMessage } from '../bridge/parseBoltMessage';
import {
  ThreeDSError,
  type CreditCardInfo,
  type ThreeDSConfig,
  type ThreeDSResult,
} from './types';
import type WebView from 'react-native-webview';
import { ThreeDSecureComponent } from './ThreeDSecureComponent';

export interface UseThreeDSecureReturn {
  /**
   * Render this component in your JSX tree. The 3DS WebView is hidden
   * until a challenge is triggered, but it must be mounted for device
   * data collection to work.
   */
  Component: (props: { style?: ViewStyle }) => React.JSX.Element;

  /**
   * Fetch a 3DS reference ID by performing device data collection.
   * This should be called after tokenization but before creating the payment.
   * THROWS ThreeDSError on failure — matches the web SDK behavior.
   */
  fetchReferenceID: (creditCardInfo: CreditCardInfo) => Promise<string>;

  /**
   * Trigger a 3DS challenge if the payment requires step-up authentication.
   * Returns ThreeDSResult with success/error — never throws.
   * Matches the web SDK behavior.
   */
  challengeWithConfig: (
    orderToken: string,
    config: ThreeDSConfig
  ) => Promise<ThreeDSResult>;
}

/**
 * Hook that creates a 3DS controller.
 *
 * Usage:
 *   const threeDSecure = useThreeDSecure()
 *   <threeDSecure.Component />
 *   const refId = await threeDSecure.fetchReferenceID({ token, bin, last4 })
 *   const result = await threeDSecure.challengeWithConfig(orderId, config)
 *   if (!result.success) { console.error(result.error) }
 */
export const useThreeDSecure = (): UseThreeDSecureReturn => {
  const webViewRef = useRef<WebView | null>(null);
  const dispatcher = useMemo(() => new BoltBridgeDispatcher(webViewRef), []);

  const Component = useCallback(
    ({ style }: { style?: ViewStyle }) => (
      <ThreeDSecureComponent dispatcher={dispatcher} style={style} />
    ),
    [dispatcher]
  );

  const fetchReferenceID = useCallback(
    (creditCardInfo: CreditCardInfo): Promise<string> => {
      // Validate input — matches web SDK validation
      if ('id' in creditCardInfo) {
        if (!creditCardInfo.id) {
          throw new ThreeDSError(1001);
        }
      } else if ('token' in creditCardInfo) {
        if (!creditCardInfo.token) {
          throw new ThreeDSError(1001);
        }
      } else {
        throw new ThreeDSError(1001);
      }

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsub();
          reject(new ThreeDSError(1010));
        }, 30000);

        const unsub = dispatcher.onMessage((data) => {
          const msg = parseBoltMessage(data);
          if (!msg) return;

          if (msg.type === 'VerificationIDResult') {
            clearTimeout(timeout);
            unsub();

            if (msg.errorCode) {
              reject(new ThreeDSError(Number(msg.errorCode)));
              return;
            }

            if (msg.error) {
              reject(new ThreeDSError(1005));
              return;
            }

            resolve(String(msg.referenceID ?? msg.verificationId ?? ''));
          }
        });

        const payload: Record<string, unknown> = {
          type: 'FetchReferenceID',
        };
        if ('id' in creditCardInfo) {
          payload.id = creditCardInfo.id;
          payload.expiration = creditCardInfo.expiration;
        } else {
          payload.token = creditCardInfo.token;
          payload.bin = creditCardInfo.bin;
          payload.last4 = creditCardInfo.last4;
        }

        dispatcher.sendMessage(JSON.stringify(payload));
      });
    },
    [dispatcher]
  );

  const challengeWithConfig = useCallback(
    (orderToken: string, config: ThreeDSConfig): Promise<ThreeDSResult> => {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          unsub();
          resolve({
            success: false,
            error: new ThreeDSError(1009),
          });
        }, 120000); // 2 min timeout for user interaction

        const unsub = dispatcher.onMessage((data) => {
          const msg = parseBoltMessage(data);
          if (!msg) return;

          if (msg.type === 'Result') {
            clearTimeout(timeout);
            unsub();

            if (msg.success === true) {
              resolve({ success: true });
            } else {
              const errorCode = Number(msg.errorCode ?? 1009);
              resolve({
                success: false,
                error: new ThreeDSError(errorCode),
              });
            }
          }
        });

        dispatcher.sendMessage(
          JSON.stringify({
            type: 'TriggerAuthWithConfig',
            orderToken,
            referenceID: config.referenceID,
            jwtPayload: config.jwtPayload,
            stepUpUrl: config.stepUpUrl,
          })
        );
      });
    },
    [dispatcher]
  );

  return useMemo(
    () => ({
      Component,
      fetchReferenceID,
      challengeWithConfig,
    }),
    [Component, fetchReferenceID, challengeWithConfig]
  );
};
