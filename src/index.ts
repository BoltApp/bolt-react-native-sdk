// @boltpay/react-native root exports

export { Bolt } from './client/Bolt';
export type { BoltConfig } from './client/Bolt';

export { BoltProvider } from './client/BoltProvider';
export type { BoltProviderProps } from './client/BoltProvider';

export { useBolt } from './client/useBolt';

export { INSTRUMENTATION_NAME } from './telemetry/attributes';
export { setDevTelemetryConfig } from './telemetry/setup';
