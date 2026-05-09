import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('../views/Login.vue'),
    },
    {
      path: '/',
      component: () => import('../views/TabLayout.vue'),
      children: [
        { path: '', redirect: '/home' },
        { path: 'home', name: 'Home', component: () => import('../views/Home.vue') },
        { path: 'my', name: 'MyEvaluations', component: () => import('../views/MyEvaluations.vue') },
      ],
    },
    {
      path: '/evaluate/:batchId',
      name: 'Evaluate',
      component: () => import('../views/Evaluate.vue'),
      props: true,
    },
    {
      path: '/eval-form/:relationId',
      name: 'EvalForm',
      component: () => import('../views/EvalForm.vue'),
      props: true,
    },
    {
      path: '/downward-eval/:batchId/:relationId',
      name: 'DownwardEval',
      component: () => import('../views/DownwardEval.vue'),
      props: true,
    },
    {
      path: '/peer-eval/:batchId/:relationId',
      name: 'PeerEval',
      component: () => import('../views/PeerEval.vue'),
      props: true,
    },
    {
      path: '/batch-eval/:batchId/:type',
      name: 'BatchEval',
      component: () => import('../views/BatchEval.vue'),
      props: true,
    },
  ],
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('h5_token')
  if (!token && to.path !== '/login') {
    next('/login')
  } else if (to.path === '/login' && token) {
    next('/home')
  } else {
    next()
  }
})

export default router
