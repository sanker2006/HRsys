import axios from 'axios'
import { ElMessage } from 'element-plus'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1'
const PUBLIC_BASE = import.meta.env.BASE_URL || '/'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
})

// 请求拦截器：注入 token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('admin_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器
api.interceptors.response.use(
  res => {
    const payload = res.data
    if (payload && typeof payload.code === 'number' && payload.code !== 0) {
      const msg = payload.message || '操作失败'
      ElMessage.error(msg)
      const error: any = new Error(msg)
      error.data = payload.data
      error.payload = payload
      return Promise.reject(error)
    }
    return payload
  },
  async err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('admin_token')
      location.href = `${PUBLIC_BASE}login`
    }
    let responseData = err.response?.data
    if (responseData instanceof Blob && responseData.type.includes('application/json')) {
      try {
        responseData = JSON.parse(await responseData.text())
      } catch {
        responseData = null
      }
    }
    const msg = responseData?.message || err.message || '网络错误'
    ElMessage.error(msg)
    return Promise.reject(err)
  }
)

export default api
