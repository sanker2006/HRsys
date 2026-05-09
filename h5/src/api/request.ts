import axios from 'axios'
import { showToast } from 'vant'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('h5_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  res => {
    const payload = res.data
    if (payload && typeof payload.code === 'number' && payload.code !== 0) {
      const msg = payload.message || '操作失败'
      showToast(msg)
      return Promise.reject(new Error(msg))
    }
    return payload
  },
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('h5_token')
      location.href = '/login'
    }
    const msg = err.response?.data?.message || err.message || '网络错误'
    showToast(msg)
    return Promise.reject(err)
  }
)

export default api
