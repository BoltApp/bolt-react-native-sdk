import { trace } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from '@opentelemetry/sdk-logs';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import {
  ATTR_OS_NAME,
  ATTR_OS_VERSION,
} from '@opentelemetry/semantic-conventions/incubating';
import { Platform } from 'react-native';
import type { BoltConfig } from '../client/Bolt';
import { BoltAttributes, INSTRUMENTATION_NAME } from './attributes';
import { OTLP_AUTH_TOKEN, OTLP_ENDPOINT } from './config';
import { SDK_VERSION } from './sdkVersion';

let initialized = false;
let tracerProvider: BasicTracerProvider | undefined;
let loggerProvider: LoggerProvider | undefined;

let devEndpoint: string | undefined;
let devAuthToken: string | undefined;

/**
 * Override the OTLP endpoint and auth token for local development.
 * Call this BEFORE constructing `new Bolt(...)`.
 *
 * Example (in your example app's entry point):
 *   import { setDevTelemetryConfig } from '@boltpay/react-native';
 *   setDevTelemetryConfig({
 *     endpoint: 'http://localhost:4318',
 *     authToken: 'unused',
 *   });
 */
export const setDevTelemetryConfig = (config: {
  endpoint: string;
  /**
   * Grafana Cloud instance/user ID. When provided together with `authToken`,
   * the SDK base64-encodes `username:authToken` for Basic auth automatically.
   */
  username?: string;
  authToken: string;
}): void => {
  devEndpoint = config.endpoint;
  devAuthToken = config.username
    ? btoa(`${config.username}:${config.authToken}`)
    : config.authToken;
};

export const initTelemetry = (config: BoltConfig): void => {
  if (initialized) return;
  initialized = true;

  const endpoint = devEndpoint ?? OTLP_ENDPOINT;

  // Credentials not injected and no dev override — running from source (e.g. example app).
  // Skip OTLP pipeline; logger/tracer still work via the no-op global providers.
  if (!devAuthToken && OTLP_AUTH_TOKEN === '__BOLT_OTLP_AUTH_TOKEN__') return;

  // devAuthToken is already base64-encoded (setDevTelemetryConfig handles it).
  // For the injected path, OTLP_AUTH_TOKEN is pre-encoded by the inject script.
  const encodedToken = devAuthToken ?? OTLP_AUTH_TOKEN;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: INSTRUMENTATION_NAME,
    [ATTR_SERVICE_VERSION]: SDK_VERSION,
    [BoltAttributes.ENVIRONMENT]: config.environment ?? 'production',
    [BoltAttributes.PUBLISHABLE_KEY]: config.publishableKey.slice(0, 8) + '...',
    [ATTR_OS_NAME]: Platform.OS,
    [ATTR_OS_VERSION]: String(Platform.Version),
  });

  const headers = {
    Authorization: `Basic ${encodedToken}`,
  };

  tracerProvider = new BasicTracerProvider({
    resource,
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: `${endpoint}/v1/traces`,
          headers,
        })
      ),
    ],
  });
  trace.setGlobalTracerProvider(tracerProvider);

  loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor(
        new OTLPLogExporter({
          url: `${endpoint}/v1/logs`,
          headers,
        })
      ),
    ],
  });
  logs.setGlobalLoggerProvider(loggerProvider);
};

export const shutdownTelemetry = async (): Promise<void> => {
  const promises: Promise<void>[] = [];
  if (tracerProvider) promises.push(tracerProvider.shutdown());
  if (loggerProvider) promises.push(loggerProvider.shutdown());
  await Promise.all(promises);
  initialized = false;
  tracerProvider = undefined;
  loggerProvider = undefined;
};
