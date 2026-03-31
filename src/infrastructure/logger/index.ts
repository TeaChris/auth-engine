import pino from 'pino';
import pinoHttp from 'pino-http';

const isDev = process.env['NODE_ENV'] !== 'production';

export const logger = pino({
  level: isDev ? 'debug' : 'info',
  base: { pid: process.pid, service: 'auth-system' },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  }),
});

export const httpLogger = pinoHttp({
  logger,
  // Assign log levels based on response status
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    if (res.statusCode >= 300) return 'silent';
    return 'info';
  },
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} completed — ${res.statusCode}`,
  // Redact sensitive fields from logs
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password'],
    censor: '[REDACTED]',
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      remoteAddress: req.socket?.remoteAddress,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
