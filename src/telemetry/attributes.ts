export const INSTRUMENTATION_NAME = '@boltpay/react-native';

export const BoltAttributes = {
  ENVIRONMENT: 'bolt.environment',
  PUBLISHABLE_KEY: 'bolt.publishable_key',
  PAYMENT_METHOD: 'payment.method',
  PAYMENT_OPERATION: 'payment.operation',
  BRIDGE_MESSAGE_TYPE: 'bolt.bridge.message_type',
  BRIDGE_DIRECTION: 'bolt.bridge.direction',
  ERROR_TYPE: 'error.type',
  ERROR_MESSAGE: 'error.message',
} as const;
