import api from './request'

export const h5Api = {
  login(phone: string, idCardTail: string) {
    return api.post('/auth/h5-login', { phone, idCardTail })
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
  submitBatch(data: { items: any[]; draft?: boolean }) {
    return api.post('/answer/batch', data)
  },
  getProgress(batchId: number) {
    return api.get(`/answer/progress/${batchId}`)
  },
}
