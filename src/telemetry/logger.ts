import {
  logs,
  type Logger as OTelLogger,
  SeverityNumber,
} from '@opentelemetry/api-logs';
import { INSTRUMENTATION_NAME } from './attributes';
import type { Attributes } from '@opentelemetry/api';

let otelLogger: OTelLogger | undefined;

const getLogger = (): OTelLogger => {
  if (!otelLogger) {
    otelLogger = logs.getLogger(INSTRUMENTATION_NAME);
  }
  return otelLogger;
};

const emit = (
  severityNumber: SeverityNumber,
  severityText: string,
  message: string,
  attributes?: Attributes
): void => {
  getLogger().emit({
    severityNumber,
    severityText,
    body: message,
    attributes,
  });
};

export const logger = {
  debug(message: string, attributes?: Attributes): void {
    emit(SeverityNumber.DEBUG, 'DEBUG', message, attributes);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(`[Bolt] ${message}`, attributes ?? '');
    }
  },

  info(message: string, attributes?: Attributes): void {
    emit(SeverityNumber.INFO, 'INFO', message, attributes);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.log(`[Bolt] ${message}`, attributes ?? '');
    }
  },

  warn(message: string, attributes?: Attributes): void {
    emit(SeverityNumber.WARN, 'WARN', message, attributes);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(`[Bolt] ${message}`, attributes ?? '');
    }
  },

  error(message: string, attributes?: Attributes): void {
    emit(SeverityNumber.ERROR, 'ERROR', message, attributes);
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.error(`[Bolt] ${message}`, attributes ?? '');
    }
  },
};
