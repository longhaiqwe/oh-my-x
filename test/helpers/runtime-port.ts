import { vi } from 'vitest'

export function event<T extends (...args: any[]) => void>() {
  const listeners = new Set<T>()
  return {
    addListener: (fn: T) => { listeners.add(fn) },
    removeListener: (fn: T) => { listeners.delete(fn) },
    emit: (...args: Parameters<T>) => { for (const fn of [...listeners]) fn(...args) },
  }
}

// A linked pair preserves the Chrome port boundary without network or browser side effects.
export function portPair(sender = { id: 'test-extension', url: 'https://x.com/home' }) {
  const client = { name: 'XF_AI_REQUEST', onMessage: event(), onDisconnect: event(), postMessage: vi.fn(), disconnect: vi.fn() }
  const server = { ...client, sender, onMessage: event(), onDisconnect: event(), postMessage: vi.fn(), disconnect: vi.fn() }
  let closed = false
  client.postMessage.mockImplementation(msg => { if (!closed) server.onMessage.emit(msg) })
  server.postMessage.mockImplementation(msg => { if (!closed) client.onMessage.emit(msg) })
  const disconnect = () => {
    if (closed) return
    closed = true
    client.onDisconnect.emit()
    server.onDisconnect.emit()
  }
  client.disconnect.mockImplementation(disconnect)
  server.disconnect.mockImplementation(disconnect)
  return { client, server }
}

export async function flushMicrotasks() {
  for (let i = 0; i < 30; i++) await Promise.resolve()
}
