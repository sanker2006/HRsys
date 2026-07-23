export type ClientMetricKind = 'api' | 'route' | 'view'

export interface ClientPerformanceMetric {
  kind: ClientMetricKind
  name: string
  duration_ms: number
  status?: number
  server_ms?: number
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const REPORT_IN_DEV = import.meta.env.VITE_PERFORMANCE_REPORTING === 'true'
const SLOW_THRESHOLD_MS = 2000

function normalizeName(value: string): string {
  let path = value
  try {
    path = new URL(value, location.origin).pathname
  } catch {}
  return path
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/[^A-Za-z0-9_:/.-]/g, '_')
    .slice(0, 120)
}

function baselineSampled(): boolean {
  const key = 'h5_performance_sampled'
  const saved = sessionStorage.getItem(key)
  if (saved !== null) return saved === '1'
  const sampled = Math.random() < 0.05
  sessionStorage.setItem(key, sampled ? '1' : '0')
  return sampled
}

function effectiveNetwork(): string | undefined {
  const value = (navigator as any).connection?.effectiveType
  return typeof value === 'string' ? value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) : undefined
}

export function parseServerTiming(header: string | null): number | undefined {
  const match = header?.match(/(?:^|,)\s*app;dur=([0-9.]+)/)
  if (!match) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) ? value : undefined
}

export function reportClientPerformance(metric: ClientPerformanceMetric): void {
  if (!import.meta.env.PROD && !REPORT_IN_DEV) return
  if (metric.duration_ms < SLOW_THRESHOLD_MS && !baselineSampled()) return
  const token = localStorage.getItem('h5_token')
  if (!token) return
  const payload = {
    ...metric,
    name: normalizeName(metric.name),
    duration_ms: Math.round(metric.duration_ms * 10) / 10,
    server_ms: metric.server_ms === undefined ? undefined : Math.round(metric.server_ms * 10) / 10,
    network: effectiveNetwork(),
  }
  queueMicrotask(() => {
    void fetch(`${API_BASE}/performance/client`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {})
  })
}
