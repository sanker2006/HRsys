import axios from 'axios'
import { showToast } from 'vant'
import { parseServerTiming, reportClientPerformance } from '../utils/performance'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const PUBLIC_BASE = import.meta.env.BASE_URL || '/'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
})

api.interceptors.request.use(config => {
  const url = String(config.url || '')
  const tokenKey = url.startsWith('/intern') || url.startsWith('/intern-auth') ? 'intern_token' : 'h5_token'
  const token = localStorage.getItem(tokenKey)
  if (token) config.headers.Authorization = `Bearer ${token}`
  ;(config as any).performanceStartedAt = performance.now()
  return config
})

api.interceptors.response.use(
  res => {
    const startedAt = Number((res.config as any).performanceStartedAt)
    if (Number.isFinite(startedAt) && !String(res.config.url || '').includes('/performance/client')) {
      reportClientPerformance({
        kind: 'api',
        name: String(res.config.url || ''),
        duration_ms: performance.now() - startedAt,
        status: res.status,
        server_ms: parseServerTiming(res.headers['server-timing'] || null),
      })
    }
    const payload = res.data
    if (payload && typeof payload.code === 'number' && payload.code !== 0) {
      const msg = payload.message || '操作失败'
      showToast(msg)
      return Promise.reject(new Error(msg))
    }
    return payload
  },
  err => {
    const startedAt = Number((err.config as any)?.performanceStartedAt)
    if (Number.isFinite(startedAt) && !String(err.config?.url || '').includes('/performance/client')) {
      reportClientPerformance({
        kind: 'api',
        name: String(err.config?.url || ''),
        duration_ms: performance.now() - startedAt,
        status: Number(err.response?.status || 0),
        server_ms: parseServerTiming(err.response?.headers?.['server-timing'] || null),
      })
    }
    if (err.response?.status === 401) {
      const path = location.pathname
      const relativePath = path.startsWith(PUBLIC_BASE)
        ? path.slice(PUBLIC_BASE.length - 1)
        : path
      const tokenKey = relativePath.startsWith('/intern') ? 'intern_token' : 'h5_token'
      localStorage.removeItem(tokenKey)
      location.href = relativePath.startsWith('/intern') ? `${PUBLIC_BASE}intern/login` : `${PUBLIC_BASE}login`
    }
    const msg = err.response?.data?.message || err.message || '网络错误'
    showToast(msg)
    return Promise.reject(err)
  }
)

export default api
