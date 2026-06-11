// C-339 PR-C item 9: leveled logger for server + client.
//
// Replaces scattered raw console.log calls with a single leveled util so log
// volume is controllable (LOG_LEVEL) without deleting operational signal.
// console.error paths are intentionally NOT routed through here — hard errors
// must always surface regardless of level (operator-truth rule).
//
// Levels (low→high): debug < info < warn < error.
// Threshold: LOG_LEVEL env, else "info" in production, "debug" otherwise.
// Anything below threshold is dropped. The API mirrors console.* (variadic),
// so it is a drop-in replacement.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function thresholdLevel(): number {
  const fromEnv = (process.env.LOG_LEVEL ?? '').toLowerCase() as LogLevel;
  if (fromEnv in ORDER) return ORDER[fromEnv];
  return process.env.NODE_ENV === 'production' ? ORDER.info : ORDER.debug;
}

function emit(level: LogLevel, args: unknown[]): void {
  if (ORDER[level] < thresholdLevel()) return;
  const tag = `[${level}]`;
  switch (level) {
    case 'error':
      console.error(tag, ...args);
      return;
    case 'warn':
      console.warn(tag, ...args);
      return;
    case 'debug':
    case 'info':
      console.log(tag, ...args);
      return;
    default: {
      const _exhaustive: never = level;
      throw new Error(`unhandled log level: ${String(_exhaustive)}`);
    }
  }
}

export const log = {
  debug: (...args: unknown[]): void => emit('debug', args),
  info: (...args: unknown[]): void => emit('info', args),
  warn: (...args: unknown[]): void => emit('warn', args),
  error: (...args: unknown[]): void => emit('error', args),
};
