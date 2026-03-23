jest.mock('react-native', () => ({
  Platform: { OS: 'ios', Version: '18.3' },
}));

describe('telemetry/setup', () => {
  let initTelemetry: typeof import('../telemetry/setup').initTelemetry;
  let shutdownTelemetry: typeof import('../telemetry/setup').shutdownTelemetry;
  let mockSetGlobalTracerProvider: jest.Mock;
  let mockSetGlobalLoggerProvider: jest.Mock;

  beforeEach(() => {
    jest.resetModules();

    mockSetGlobalTracerProvider = jest.fn();
    mockSetGlobalLoggerProvider = jest.fn();

    jest.doMock('@opentelemetry/api', () => ({
      trace: {
        setGlobalTracerProvider: mockSetGlobalTracerProvider,
        getTracer: jest.fn(),
      },
      SpanStatusCode: { OK: 1, ERROR: 2 },
    }));

    jest.doMock('@opentelemetry/api-logs', () => ({
      logs: {
        setGlobalLoggerProvider: mockSetGlobalLoggerProvider,
        getLogger: jest.fn(),
      },
      SeverityNumber: { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 },
    }));

    jest.doMock('@opentelemetry/sdk-trace-base', () => ({
      BasicTracerProvider: jest.fn().mockImplementation(() => ({
        shutdown: jest.fn().mockResolvedValue(undefined),
      })),
      BatchSpanProcessor: jest.fn(),
    }));

    jest.doMock('@opentelemetry/sdk-logs', () => ({
      LoggerProvider: jest.fn().mockImplementation(() => ({
        shutdown: jest.fn().mockResolvedValue(undefined),
      })),
      BatchLogRecordProcessor: jest.fn(),
    }));

    jest.doMock('@opentelemetry/exporter-trace-otlp-http', () => ({
      OTLPTraceExporter: jest.fn(),
    }));

    jest.doMock('@opentelemetry/exporter-logs-otlp-http', () => ({
      OTLPLogExporter: jest.fn(),
    }));

    jest.doMock('@opentelemetry/resources', () => ({
      resourceFromAttributes: jest
        .fn()
        .mockImplementation((attrs: unknown) => ({ attributes: attrs })),
    }));

    jest.doMock('@opentelemetry/semantic-conventions', () => ({
      ATTR_SERVICE_NAME: 'service.name',
      ATTR_SERVICE_VERSION: 'service.version',
      SEMRESATTRS_OS_NAME: 'os.name',
      SEMRESATTRS_OS_VERSION: 'os.version',
    }));

    jest.doMock('../telemetry/config', () => ({
      OTLP_ENDPOINT: 'https://otlp.test/otlp',
      OTLP_USERNAME: 'test_user',
      OTLP_AUTH_TOKEN: 'test_token',
    }));
  });

  it('should create providers and register them globally', async () => {
    ({ initTelemetry, shutdownTelemetry } = require('../telemetry/setup'));

    initTelemetry({ publishableKey: 'pk_live_test1234' });

    expect(mockSetGlobalTracerProvider).toHaveBeenCalledTimes(1);
    expect(mockSetGlobalLoggerProvider).toHaveBeenCalledTimes(1);

    await shutdownTelemetry();
  });

  it('should be idempotent — second call is a no-op', async () => {
    ({ initTelemetry, shutdownTelemetry } = require('../telemetry/setup'));

    initTelemetry({ publishableKey: 'pk_live_test1234' });
    initTelemetry({ publishableKey: 'pk_live_test1234' });

    expect(mockSetGlobalTracerProvider).toHaveBeenCalledTimes(1);
    expect(mockSetGlobalLoggerProvider).toHaveBeenCalledTimes(1);

    await shutdownTelemetry();
  });

  it('should shutdown and allow re-initialization', async () => {
    ({ initTelemetry, shutdownTelemetry } = require('../telemetry/setup'));

    initTelemetry({ publishableKey: 'pk_live_test1234' });
    await shutdownTelemetry();

    initTelemetry({ publishableKey: 'pk_live_test5678' });
    expect(mockSetGlobalTracerProvider).toHaveBeenCalledTimes(2);

    await shutdownTelemetry();
  });
});

describe('telemetry/logger', () => {
  let mockEmit: jest.Mock;

  beforeEach(() => {
    jest.resetModules();
    mockEmit = jest.fn();
    // Mock the api-logs module so getLogger returns our mock
    jest.doMock('@opentelemetry/api-logs', () => ({
      logs: {
        getLogger: jest.fn().mockReturnValue({ emit: mockEmit }),
        setGlobalLoggerProvider: jest.fn(),
      },
      SeverityNumber: {
        DEBUG: 5,
        INFO: 9,
        WARN: 13,
        ERROR: 17,
      },
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should emit to OTel and console in __DEV__ mode', () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    const { logger } = require('../telemetry/logger');

    logger.info('test message', { key: 'value' });

    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'test message',
        severityText: 'INFO',
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith('[Bolt] test message', {
      key: 'value',
    });

    consoleSpy.mockRestore();
  });

  it('should emit error level to console.error in __DEV__ mode', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const { logger } = require('../telemetry/logger');

    logger.error('bad thing', { code: 500 });

    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith('[Bolt] bad thing', { code: 500 });

    consoleSpy.mockRestore();
  });

  it('should emit warn level to console.warn in __DEV__ mode', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const { logger } = require('../telemetry/logger');

    logger.warn('heads up');

    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith('[Bolt] heads up', '');

    consoleSpy.mockRestore();
  });
});

describe('telemetry/tracer', () => {
  it('should return a working span from startSpan', () => {
    jest.resetModules();

    const mockSpan = {
      setStatus: jest.fn(),
      end: jest.fn(),
      setAttribute: jest.fn(),
      recordException: jest.fn(),
    };
    const mockTracer = { startSpan: jest.fn().mockReturnValue(mockSpan) };

    jest.doMock('@opentelemetry/api', () => ({
      trace: {
        getTracer: jest.fn().mockReturnValue(mockTracer),
        setGlobalTracerProvider: jest.fn(),
      },
      SpanStatusCode: { OK: 1, ERROR: 2 },
    }));

    const { startSpan, SpanStatusCode } = require('../telemetry/tracer');

    const span = startSpan('bolt.test.span', { foo: 'bar' });
    expect(mockTracer.startSpan).toHaveBeenCalledWith('bolt.test.span', {
      attributes: { foo: 'bar' },
    });

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.OK,
    });
    expect(mockSpan.end).toHaveBeenCalled();

    jest.restoreAllMocks();
  });
});

describe('telemetry/attributes', () => {
  it('should export INSTRUMENTATION_NAME', () => {
    const { INSTRUMENTATION_NAME } = require('../telemetry/attributes');
    expect(INSTRUMENTATION_NAME).toBe('@boltpay/react-native');
  });

  it('should export BoltAttributes with expected keys', () => {
    const { BoltAttributes } = require('../telemetry/attributes');
    expect(BoltAttributes.ENVIRONMENT).toBe('bolt.environment');
    expect(BoltAttributes.PUBLISHABLE_KEY).toBe('bolt.publishable_key');
    expect(BoltAttributes.PAYMENT_METHOD).toBe('payment.method');
    expect(BoltAttributes.ERROR_TYPE).toBe('error.type');
  });
});
