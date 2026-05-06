const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] ?? (process.env.DEBUG ? 0 : 1)

function formatMessage(level, args) {
  const ts = new Date().toISOString()
  return [`[${ts}] [${level.toUpperCase()}]`, ...args]
}

export const logger = {
  debug(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.debug) process.stdout.write(formatMessage('debug', args).join(' ') + '\n')
  },
  info(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.info) process.stdout.write(formatMessage('info', args).join(' ') + '\n')
  },
  warn(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.warn) console.warn(...formatMessage('warn', args))
  },
  error(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.error) console.error(...formatMessage('error', args))
  },
}
