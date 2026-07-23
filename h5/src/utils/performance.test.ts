import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('client performance reporting', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('VITE_PERFORMANCE_REPORTING', 'true')
    vi.stubGlobal('location', { origin: 'http://localhost' })
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('queueMicrotask', (callback: VoidFunction) => callback())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('never affects business requests when browser storage is unavailable', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new DOMException('Storage is disabled', 'SecurityError') },
      setItem: () => { throw new DOMException('Storage is disabled', 'SecurityError') },
    })
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new DOMException('Storage is disabled', 'SecurityError') },
    })

    const { reportClientPerformance } = await import('./performance')

    expect(() => reportClientPerformance({
      kind: 'api',
      name: '/batch/',
      duration_ms: 3000,
      status: 200,
    })).not.toThrow()
  })

  it('swallows telemetry network failures', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => '1',
      setItem: vi.fn(),
    })
    vi.stubGlobal('localStorage', {
      getItem: () => 'token',
    })
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))

    const { reportClientPerformance } = await import('./performance')

    expect(() => reportClientPerformance({
      kind: 'api',
      name: '/batch/',
      duration_ms: 10,
      status: 200,
    })).not.toThrow()
    await Promise.resolve()
  })
})
