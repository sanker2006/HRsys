import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('../views/Login.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      component: () => import('../views/Layout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/dashboard' },
        { path: 'dashboard', name: 'Dashboard', component: () => import('../views/Dashboard.vue') },
        { path: 'batch', name: 'Batch', component: () => import('../views/Batch.vue') },
        { path: 'matrix/:batchId', name: 'EvalMatrix', component: () => import('../views/EvalMatrix.vue'), props: true },
        { path: 'self-question/:batchId', name: 'SelfQuestion', component: () => import('../views/SelfQuestion.vue'), props: true },
        { path: 'relation/:batchId', name: 'Relation', component: () => import('../views/Relation.vue'), props: true },
        { path: 'progress/:batchId', name: 'Progress', component: () => import('../views/Progress.vue'), props: true },
        { path: 'user', name: 'User', component: () => import('../views/User.vue') },
        { path: 'department', name: 'Department', component: () => import('../views/Department.vue') },
      ],
    },
  ],
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('admin_token')
  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else if (to.path === '/login' && token) {
    next('/dashboard')
  } else {
    next()
  }
})

export default router
