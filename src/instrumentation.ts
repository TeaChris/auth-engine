import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import { logger } from '@/infrastructure';

// Define the service resource
const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: 'auth-system',
  [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'development',
});

// Trace Exporter (OTLP HTTP default to localhost:4318)
const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces',
});

// Metric Exporter (Prometheus on port 9464)
const metricExporter = new PrometheusExporter(
  {
    port: 9464,
  },
  () => {
    logger.info('📊 Prometheus metrics server started on port 9464');
  }
);

// Initialize the OTel SDK
const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader: metricExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Configure specific instrumentations if needed
      '@opentelemetry/instrumentation-fs': { enabled: false }, // Avoid noise
    }),
    new PrismaInstrumentation(),
  ],
});

// Start the SDK
try {
  sdk.start();
  logger.info('🔭 OpenTelemetry SDK initialized');
} catch (error) {
  logger.error('❌ Failed to initialize OpenTelemetry SDK', error);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => logger.info('🔭 OpenTelemetry SDK shut down'))
    .catch((error) => logger.error('❌ Error shutting down OpenTelemetry SDK', error))
    .finally(() => process.exit(0));
});

export default sdk;
