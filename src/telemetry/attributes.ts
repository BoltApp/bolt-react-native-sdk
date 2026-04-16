export const INSTRUMENTATION_NAME = '@boltpay/react-native';

export const BoltAttributes = {
  ENVIRONMENT: 'bolt.environment',
  PUBLISHABLE_KEY: 'bolt.publishable_key',
  PLATFORM: 'bolt.platform',
  PAYMENT_METHOD: 'payment.method',
  PAYMENT_OPERATION: 'payment.operation',
  PAYMENT_CANCELLED: 'payment.cancelled',
  BRIDGE_MESSAGE_TYPE: 'bolt.bridge.message_type',
  BRIDGE_DIRECTION: 'bolt.bridge.direction',
  ERROR_TYPE: 'error.type',
  ERROR_MESSAGE: 'error.message',
} as const;
