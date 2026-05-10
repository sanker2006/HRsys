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
  generate(batchId: number) {
    return api.post(`/relation/generate/${batchId}`)
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
