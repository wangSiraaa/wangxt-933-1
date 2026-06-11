import axios from 'axios'
import { ElMessage } from 'element-plus'

const request = axios.create({
  baseURL: '/api',
  timeout: 10000
})

request.interceptors.response.use(
  response => {
    const res = response.data
    if (res.code === 200) {
      return res.data
    } else {
      ElMessage.error(res.message || '请求失败')
      return Promise.reject(new Error(res.message || '请求失败'))
    }
  },
  error => {
    ElMessage.error(error.message || '网络错误')
    return Promise.reject(error)
  }
)

export const orderApi = {
  create: (data) => request.post('/orders', data),
  list: (params) => request.get('/orders', { params }),
  detail: (id) => request.get(`/orders/${id}`)
}

export const acceptanceApi = {
  create: (orderId, data) => request.post(`/orders/${orderId}/acceptance`, data),
  update: (id, data) => request.put(`/acceptance/${id}`, data),
  getByOrder: (orderId) => request.get(`/acceptance/order/${orderId}`),
  addReview: (id, data) => request.post(`/acceptance/${id}/review`, data)
}

export const deductionApi = {
  rules: () => request.get('/deduction/rules'),
  calculate: (data) => request.post('/deduction/calculate', data)
}

export const refundApi = {
  create: (data) => request.post('/refunds', data),
  list: (params) => request.get('/refunds', { params }),
  detail: (id) => request.get(`/refunds/${id}`),
  approve: (id, data) => request.post(`/refunds/${id}/approve`, data)
}

export const timelineApi = {
  list: (orderId) => request.get(`/timelines/${orderId}`)
}

export default request
