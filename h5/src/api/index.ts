import api from './request'

export const h5Api = {
  login(phone: string, password: string) {
    return api.post('/auth/h5-login', { phone, password })
  },
  changePassword(newPassword: string, confirmPassword: string) {
    return api.post('/auth/change-password', {
      new_password: newPassword,
      confirm_password: confirmPassword,
    })
  },
  me() {
    return api.get('/auth/me')
  },
  getBatches() {
    return api.get('/batch/', { params: { status: 'active' } })
  },
  getMyRelations(batchId: number) {
    return api.get('/relation/my', { params: { batch_id: batchId } })
  },
  getMyQuestions(batchId: number) {
    return api.get(`/self-question/${batchId}/me`)
  },
  getRelationDetail(relationId: number) {
    return api.get(`/answer/relation/${relationId}`)
  },
  previewSubmit(relationId: number, answers: Array<{ seq: number; score: number }>) {
    return api.post(`/answer/relation/${relationId}/submit-preview`, { answers })
  },
  downloadPersonalSummary(relationId: number) {
    return api.get(`/personal-summary/relation/${relationId}/download`, {
      responseType: 'blob',
      timeout: 60000,
    })
  },
  getDownwardOverview(batchId: number) {
    return api.get(`/answer/downward/${batchId}`)
  },
  submitSelf(data: { relation_id: number; answers: Array<{ seq: number; score: number }>; draft?: boolean }) {
    return api.post('/answer/self', data)
  },
  submitDetail(data: { relation_id: number; answers: Array<{ seq: number; score: number }>; draft?: boolean }) {
    return api.post('/answer/detail', data)
  },
  submitTotal(data: { relation_id: number; score: number; draft?: boolean }) {
    return api.post('/answer/total', data)
  },
  submitLeaderTotals(data: { relation_id: number; performance_score: number; comprehensive_score: number; draft?: boolean }) {
    return api.post('/answer/leader-total', data)
  },
  revoke(relationId: number) {
    return api.post(`/answer/relation/${relationId}/revoke`)
  },
  submitBatch(data: { items: any[]; draft?: boolean }) {
    return api.post('/answer/batch', data)
  },
  getProgress(batchId: number) {
    return api.get(`/answer/progress/${batchId}`)
  },
}

export const internH5Api = {
  login(phone: string, idCardTail: string) {
    return api.post('/intern-auth/login', { phone, idCardTail })
  },
  me() {
    return api.get('/intern/me')
  },
  punch(data: { latitude?: number | null; longitude?: number | null; accuracy?: number | null; photoBase64?: string | null }) {
    return api.post('/intern/attendance/punch', data)
  },
  month(month: string) {
    return api.get('/intern/attendance/month', { params: { month } })
  },
  year(year: string) {
    return api.get('/intern/attendance/year', { params: { year } })
  },
}
