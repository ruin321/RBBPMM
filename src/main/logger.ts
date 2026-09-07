import { getDebugLogging } from './store'


export function debugLog(...args: unknown[]): void {
  if (getDebugLogging()) {
    console.log('[debug]', ...args)
  }
}


export function debugError(...args: unknown[]): void {
  if (getDebugLogging()) {
    console.error('[debug]', ...args)
  }
}
