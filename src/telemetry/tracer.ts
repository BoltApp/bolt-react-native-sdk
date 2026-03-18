import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { Span, Attributes } from '@opentelemetry/api';
import { INSTRUMENTATION_NAME } from './attributes';

export { SpanStatusCode };
export type { Span };

export const startSpan = (name: string, attributes?: Attributes): Span =>
  trace.getTracer(INSTRUMENTATION_NAME).startSpan(name, { attributes });
