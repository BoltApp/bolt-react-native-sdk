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
import { startSpan, SpanStatusCode } from '../telemetry/tracer';
import { BoltAttributes } from '../telemetry/attributes';

export interface UseThreeDSecureReturn {
  /**
   * Render this component in your JSX tree. The 3DS WebView is hidden
   * until a challenge is triggered, but it must be mounted for device
   * data collection to work.
   */
  Component: (props: { style?: ViewStyle }) => React.JSX.Element;

  /**
   * Fetch a 3DS reference ID by performing device data collection.
   * Accepts either a TokenResult (from tokenize()) or a CreditCardId
   * (from Bolt's Add Card API — { id, expiration }).
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

      const span = startSpan('bolt.three_ds.fetch_reference_id', {
        [BoltAttributes.PAYMENT_METHOD]: 'credit_card',
        [BoltAttributes.PAYMENT_OPERATION]: 'fetch_reference_id',
      });

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsub();
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Timeout' });
          span.end();
          reject(new ThreeDSError(1010));
        }, 30000);

        const unsub = dispatcher.onMessage((data) => {
          const msg = parseBoltMessage(data);
          if (!msg) return;

          if (msg.type === 'VerificationIDResult') {
            clearTimeout(timeout);
            unsub();

            const errorCode = Number(msg.errorCode ?? 0);
            if (errorCode > 0) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: `ThreeDSError ${errorCode}`,
              });
              span.end();
              reject(new ThreeDSError(errorCode));
              return;
            }

            if (msg.error) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: 'ThreeDSError 1005',
              });
              span.end();
              reject(new ThreeDSError(1005));
              return;
            }

            span.setStatus({ code: SpanStatusCode.OK });
            span.end();
            resolve(String(msg.success ?? ''));
          }

          // Storm sends Result (not VerificationIDResult) when the DDC JWT
          // API call itself fails — treat as an immediate error.
          if (msg.type === 'Result' && msg.success === false) {
            clearTimeout(timeout);
            unsub();
            const code = Number(msg.errorCode ?? 1010);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: `ThreeDSError ${code}`,
            });
            span.end();
            reject(new ThreeDSError(code));
          }
        });

        const creditCard =
          'id' in creditCardInfo
            ? { id: creditCardInfo.id, expiration: creditCardInfo.expiration }
            : {
                token: creditCardInfo.token,
                bin: creditCardInfo.bin,
                last4: creditCardInfo.last4,
                expiration: creditCardInfo.expiration,
              };

        dispatcher.sendMessage(
          JSON.stringify({ type: 'FetchReferenceID', creditCard })
        );
      });
    },
    [dispatcher]
  );

  const challengeWithConfig = useCallback(
    (orderToken: string, config: ThreeDSConfig): Promise<ThreeDSResult> => {
      const span = startSpan('bolt.three_ds.challenge', {
        [BoltAttributes.PAYMENT_METHOD]: 'credit_card',
        [BoltAttributes.PAYMENT_OPERATION]: 'challenge',
      });

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          unsub();
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Timeout' });
          span.end();
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
              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
              resolve({ success: true });
            } else {
              const errorCode = Number(msg.errorCode ?? 1009);
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: `ThreeDSError ${errorCode}`,
              });
              span.end();
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
            config: {
              referenceID: config.referenceID,
              jwtPayload: config.jwtPayload,
              stepUpUrl: config.stepUpUrl,
            },
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
