import api from './request'

export const authApi = {
  login(account: string, password: string) {
    return api.post('/auth/login', { account, password })
  },
  me() {
    return api.get('/auth/me')
  },
}

export const userApi = {
  list(params: any) {
    return api.get('/user/', { params })
  },
  create(data: any) {
    return api.post('/user/', data)
  },
  update(id: number, data: any) {
    return api.put(`/user/${id}`, data)
  },
  delete(id: number) {
    return api.delete(`/user/${id}`)
  },
  resetPassword(id: number) {
    return api.post(`/user/${id}/reset-password`)
  },
  departments() {
    return api.get('/user/departments')
  },
  import(users: any[]) {
    return api.post('/user/import', { users })
  },
  export(params: any) {
    return api.get('/user/export', { params })
  },
}

export const batchApi = {
  list(params?: any) {
    return api.get('/batch/', { params })
  },
  get(id: number) {
    return api.get(`/batch/${id}`)
  },
  create(data: any) {
    return api.post('/batch/', data)
  },
  update(id: number, data: any) {
    return api.put(`/batch/${id}`, data)
  },
  start(id: number) {
    return api.post(`/batch/${id}/start`)
  },
  close(id: number) {
    return api.post(`/batch/${id}/close`)
  },
  delete(id: number) {
    return api.delete(`/batch/${id}`)
  },
}

export const evalMatrixApi = {
  get(batchId: number) {
    return api.get(`/eval-matrix/${batchId}`)
  },
  save(batchId: number, rows: any[], peer_cross_dept: number = 0) {
    return api.put(`/eval-matrix/${batchId}`, { rows, peer_cross_dept })
  },
  reset(batchId: number) {
    return api.post(`/eval-matrix/${batchId}/reset`)
  },
}

export const relationApi = {
  list(params: { batchId: number; evaluator_id?: number; target_id?: number; eval_type?: string; status?: string; pageSize?: number }) {
    return api.get('/relation/', {
      params: {
        batch_id: params.batchId,
        pageSize: params.pageSize || 100,
        evaluator_id: params.evaluator_id,
        target_id: params.target_id,
        eval_type: params.eval_type,
        status: params.status,
      }
    })
  },
  my(batchId: number) {
    return api.get('/relation/my', { params: { batch_id: batchId } })
  },
  previewGenerate(batchId: number) {
    return api.post(`/relation/generate/${batchId}/preview`)
  },
  generate(batchId: number, previewHash: string) {
    return api.post(`/relation/generate/${batchId}`, { preview_hash: previewHash })
  },
  create(data: any) {
    return api.post('/relation/', data)
  },
  delete(id: number) {
    return api.delete(`/relation/${id}`)
  },
  import(batchId: number, relations: any[]) {
    return api.post('/relation/import', { batch_id: batchId, relations })
  },
  export(batchId: number, params?: any) {
    return api.get(`/relation/export/${batchId}`, { params })
  },
}

export const selfQuestionApi = {
  list(batchId: number) {
    return api.get(`/self-question/${batchId}`)
  },
  mine(batchId: number) {
    return api.get(`/self-question/${batchId}/me`)
  },
  import(batchId: number, items: any[]) {
    return api.post('/self-question/import', { batch_id: batchId, items })
  },
  delete(batchId: number) {
    return api.delete(`/self-question/${batchId}`)
  },
}

export const personalSummaryApi = {
  list(batchId: number, params?: any) {
    return api.get(`/personal-summary/admin/${batchId}`, { params })
  },
  upload(batchId: number, userId: number, file: File) {
    const form = new FormData()
    form.append('file', file)
    return api.put(`/personal-summary/admin/${batchId}/${userId}`, form)
  },
  delete(batchId: number, userId: number) {
    return api.delete(`/personal-summary/admin/${batchId}/${userId}`)
  },
  download(batchId: number, userId: number) {
    return api.get(`/personal-summary/admin/${batchId}/${userId}/download`, { responseType: 'blob' })
  },
}

export const answerApi = {
  getRelation(relationId: number) {
    return api.get(`/answer/relation/${relationId}`)
  },
  submitSelf(data: any) {
    return api.post('/answer/self', data)
  },
  submitTotal(data: any) {
    return api.post('/answer/total', data)
  },
  progress(batchId: number) {
    return api.get(`/answer/progress/${batchId}`)
  },
  getAdminProgress(batchId: number) {
    return api.get(`/answer/admin/progress/${batchId}`)
  },
  statistics(batchId: number) {
    return api.get(`/answer/admin/statistics/${batchId}`)
  },
  exportStatistics(batchId: number) {
    return api.get(`/answer/admin/statistics/${batchId}/export`, { responseType: 'blob' })
  },
  leaderScores(batchId: number) {
    return api.get(`/answer/admin/leader-score/${batchId}`)
  },
  exportLeaderScore(batchId: number, leaderId: number) {
    return api.get(`/answer/admin/leader-score/${batchId}/${leaderId}/export`, { responseType: 'blob' })
  },
  previewLeaderScore(batchId: number, leaderId: number, file: File) {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/answer/admin/leader-score/${batchId}/${leaderId}/preview`, form)
  },
  importLeaderScore(batchId: number, leaderId: number, file: File, preview: any, confirmOverwrite: boolean) {
    const form = new FormData()
    form.append('file', file)
    form.append('file_hash', preview.file_hash)
    form.append('reference_fingerprint', preview.reference_fingerprint)
    form.append('confirm_overwrite', String(confirmOverwrite))
    return api.post(`/answer/admin/leader-score/${batchId}/${leaderId}/import`, form)
  },
}

export const departmentApi = {
  list() {
    return api.get('/department/')
  },
  create(data: { name: string; sort_order?: number }) {
    return api.post('/department/', data)
  },
  update(id: number, data: { name: string; sort_order?: number }) {
    return api.put(`/department/${id}`, data)
  },
  delete(id: number) {
    return api.delete(`/department/${id}`)
  },
}

export const internApi = {
  list(params?: any) {
    return api.get('/admin/interns', { params })
  },
  create(data: any) {
    return api.post('/admin/interns', data)
  },
  update(id: number, data: any) {
    return api.put(`/admin/interns/${id}`, data)
  },
  import(interns: any[]) {
    return api.post('/admin/interns/import', { interns })
  },
  records(params?: any) {
    return api.get('/admin/intern-attendance/records', { params })
  },
  recordPhoto(id: number) {
    return api.get(`/admin/intern-attendance/records/${id}/photo`, { responseType: 'blob' })
  },
  statistics(params?: any) {
    return api.get('/admin/intern-attendance/statistics', { params })
  },
  adjust(data: any) {
    return api.post('/admin/intern-attendance/adjustments', data)
  },
  export(params?: any) {
    return api.get('/admin/intern-attendance/export', { params, responseType: 'blob' })
  },
}
