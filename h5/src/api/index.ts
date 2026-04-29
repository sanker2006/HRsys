import api from './request'

export const h5Api = {
  login(phone: string, idCardTail: string) {
    return api.post('/auth/h5-login', { phone, idCardTail })
  },
  me() {
    return api.get('/auth/me')
  },
  // 获取当前可参与的评价批次
  getBatches() {
    return api.get('/batch/', { params: { status: 'active' } })
  },
  // 获取我的评价关系
  getMyRelations(batchId: number) {
    return api.get('/relation/my', { params: { batch_id: batchId } })
  },
  // 获取自评题目
  getMyQuestions(batchId: number) {
    return api.get(`/self-question/${batchId}/me`)
  },
  // 获取某条评价的详情（含答案）
  getRelationDetail(relationId: number) {
    return api.get(`/answer/relation/${relationId}`)
  },
  // 提交自评
  submitSelf(data: { relation_id: number; answers: Array<{ seq: number; score: number }>; draft?: boolean }) {
    return api.post('/answer/self', data)
  },
  // 提交总分评价
  submitTotal(data: { relation_id: number; score: number; draft?: boolean }) {
    return api.post('/answer/total', data)
  },
  // 获取我的进度
  getProgress(batchId: number) {
    return api.get(`/answer/progress/${batchId}`)
  },
}
