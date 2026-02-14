type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLevel(): LogLevel {
  const raw = process.env.TPILOT_LOG_LEVEL?.toLowerCase();
  if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
    return raw;
  }
  return 'info';
}

function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const configured = resolveLevel();
  if (LEVEL_ORDER[level] < LEVEL_ORDER[configured]) {
    return;
  }

  const prefix = `[tpilot:${level}]`;

  if (meta && Object.keys(meta).length > 0) {
    if (level === 'error') {
      console.error(prefix, message, meta);
      return;
    }
    if (level === 'warn') {
      console.warn(prefix, message, meta);
      return;
    }
    if (level === 'info') {
      console.info(prefix, message, meta);
      return;
    }
    console.debug(prefix, message, meta);
    return;
  }

  if (level === 'error') {
    console.error(prefix, message);
    return;
  }
  if (level === 'warn') {
    console.warn(prefix, message);
    return;
  }
  if (level === 'info') {
    console.info(prefix, message);
    return;
  }
  console.debug(prefix, message);
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>): void => log('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>): void => log('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>): void => log('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>): void => log('error', message, meta),
};
