const DEV = import.meta.env.DEV
export const debugLog = (...args: unknown[]) => { if (DEV) console.log(...args) }
export const debugError = (...args: unknown[]) => { if (DEV) console.error(...args) }
