import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { Span, Attributes } from '@opentelemetry/api';
import { INSTRUMENTATION_NAME } from './attributes';

export { SpanStatusCode };
export type { Span };

export const startSpan = (name: string, attributes?: Attributes): Span =>
  trace.getTracer(INSTRUMENTATION_NAME).startSpan(name, { attributes });

/**
 * Emit a zero-duration funnel marker as a standalone span. Use this for
 * point-in-time events that don't have a parent span in scope (e.g. a button
 * press that precedes the operation span). For markers inside an existing
 * operation span, prefer `parentSpan.addEvent(...)` to preserve correlation.
 */
export const recordEvent = (name: string, attributes?: Attributes): void => {
  const span = startSpan(name, attributes);
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
};
