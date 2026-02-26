import React, { useRef, useMemo, useCallback } from 'react';
import type { ViewStyle } from 'react-native';
import {
  BoltPaymentWebView,
  type BoltPaymentWebViewHandle,
} from '../bridge/BoltPaymentWebView';
import { BoltBridgeDispatcher } from '../bridge/BoltBridgeDispatcher';
import type { CreditCardInfo, ThreeDSConfig, ThreeDSResult } from './types';
import type WebView from 'react-native-webview';

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
   */
  fetchReferenceID: (creditCardInfo: CreditCardInfo) => Promise<string>;

  /**
   * Trigger a 3DS challenge if the payment requires step-up authentication.
   * Returns the challenge result (success/failure).
   */
  challengeWithConfig: (
    orderToken: string,
    config: ThreeDSConfig
  ) => Promise<ThreeDSResult>;
}

/**
 * Parse a Bolt message from the 3DS iframe.
 */
function parseBoltMessage(data: unknown): Record<string, unknown> | null {
  let msg = data;
  if (typeof msg === 'string') {
    try {
      msg = JSON.parse(msg);
    } catch {
      return null;
    }
  }
  if (typeof msg === 'object' && msg !== null) {
    return msg as Record<string, unknown>;
  }
  return null;
}

/**
 * useThreeDSecure — hook that creates a 3DS controller.
 *
 * Usage:
 *   const threeDSecure = useThreeDSecure()
 *   <threeDSecure.Component />
 *   const refId = await threeDSecure.fetchReferenceID({ token, bin, last4 })
 *   const result = await threeDSecure.challengeWithConfig(orderId, config)
 */
export function useThreeDSecure(): UseThreeDSecureReturn {
  const webViewRef = useRef<WebView | null>(null);
  const webViewHandleRef = useRef<BoltPaymentWebViewHandle>(null);
  const dispatcher = useMemo(() => new BoltBridgeDispatcher(webViewRef), []);

  const ThreeDSecureComponent = useCallback(
    ({ style }: { style?: ViewStyle }) => (
      <BoltPaymentWebView
        ref={webViewHandleRef}
        element="3d-secure"
        dispatcher={dispatcher}
        style={style}
      />
    ),
    [dispatcher]
  );

  const fetchReferenceID = useCallback(
    (creditCardInfo: CreditCardInfo): Promise<string> => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsub();
          reject(new Error('3DS fetchReferenceID timed out'));
        }, 30000);

        const unsub = dispatcher.onMessage((data) => {
          const msg = parseBoltMessage(data);
          if (!msg) return;

          if (msg.type === 'VerificationIDResult') {
            clearTimeout(timeout);
            unsub();

            if (msg.error) {
              reject(new Error(String(msg.error)));
              return;
            }

            resolve(String(msg.referenceID ?? msg.verificationId ?? ''));
          }
        });

        // Send FetchReferenceID to the 3DS iframe
        dispatcher.sendMessage(
          JSON.stringify({
            type: 'FetchReferenceID',
            token: creditCardInfo.token,
            bin: creditCardInfo.bin,
            last4: creditCardInfo.last4,
          })
        );
      });
    },
    [dispatcher]
  );

  const challengeWithConfig = useCallback(
    (orderToken: string, config: ThreeDSConfig): Promise<ThreeDSResult> => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsub();
          reject(new Error('3DS challenge timed out'));
        }, 120000); // 2 min timeout for user interaction

        const unsub = dispatcher.onMessage((data) => {
          const msg = parseBoltMessage(data);
          if (!msg) return;

          if (msg.type === 'Result') {
            clearTimeout(timeout);
            unsub();

            resolve({
              success: msg.success === true,
              transactionId: msg.transactionId
                ? String(msg.transactionId)
                : undefined,
              error: msg.error ? String(msg.error) : undefined,
            });
          }
        });

        // Send TriggerAuthWithConfig to start the 3DS challenge
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
      Component: ThreeDSecureComponent,
      fetchReferenceID,
      challengeWithConfig,
    }),
    [ThreeDSecureComponent, fetchReferenceID, challengeWithConfig]
  );
}
