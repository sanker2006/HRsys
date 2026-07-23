export const loadEvaluateView = () => import('../views/Evaluate.vue')
export const loadEvalFormView = () => import('../views/EvalForm.vue')
export const loadBatchEvalView = () => import('../views/BatchEval.vue')
export const loadDownwardEvalView = () => import('../views/DownwardEval.vue')
export const loadPeerEvalView = () => import('../views/PeerEval.vue')

export type EvaluationView = 'evaluate' | 'self-detail' | 'batch' | 'downward-detail' | 'peer-detail'

export function preloadEvaluationView(view: EvaluationView): Promise<unknown> {
  if (view === 'evaluate') return loadEvaluateView()
  if (view === 'self-detail') return loadEvalFormView()
  if (view === 'batch') return loadBatchEvalView()
  if (view === 'downward-detail') return loadDownwardEvalView()
  return loadPeerEvalView()
}

export function preloadWhenIdle(view: EvaluationView): void {
  const schedule = (window as any).requestIdleCallback
    || ((callback: () => void) => window.setTimeout(callback, 50))
  schedule(() => { void preloadEvaluationView(view) })
}
