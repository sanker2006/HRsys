import { createRouter, createWebHistory } from 'vue-router'
import { reportClientPerformance } from '../utils/performance'
import {
  loadBatchEvalView,
  loadDownwardEvalView,
  loadEvalFormView,
  loadEvaluateView,
  loadPeerEvalView,
} from './loaders'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'Login',
      component: () => import('../views/Login.vue'),
    },
    {
      path: '/change-password',
      name: 'ChangePassword',
      component: () => import('../views/ChangePassword.vue'),
    },
    {
      path: '/intern/login',
      name: 'InternLogin',
      component: () => import('../views/InternLogin.vue'),
    },
    {
      path: '/intern/home',
      name: 'InternHome',
      component: () => import('../views/InternHome.vue'),
    },
    {
      path: '/intern/records',
      name: 'InternRecords',
      component: () => import('../views/InternRecords.vue'),
    },
    {
      path: '/intern/calendar',
      name: 'InternCalendar',
      component: () => import('../views/InternCalendar.vue'),
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
      component: loadEvaluateView,
      props: true,
    },
    {
      path: '/eval-form/:relationId',
      name: 'EvalForm',
      component: loadEvalFormView,
      props: true,
    },
    {
      path: '/downward-eval/:batchId/:relationId',
      name: 'DownwardEval',
      component: loadDownwardEvalView,
      props: true,
    },
    {
      path: '/peer-eval/:batchId/:relationId',
      name: 'PeerEval',
      component: loadPeerEvalView,
      props: true,
    },
    {
      path: '/batch-eval/:batchId/:type',
      name: 'BatchEval',
      component: loadBatchEvalView,
      props: true,
    },
  ],
})

let routeStartedAt = performance.now()

router.beforeEach((to, _from, next) => {
  routeStartedAt = performance.now()
  if (to.path.startsWith('/intern')) {
    const token = localStorage.getItem('intern_token')
    if (!token && to.path !== '/intern/login') {
      next('/intern/login')
      return
    }
    if (to.path === '/intern/login' && token) {
      next('/intern/home')
      return
    }
    next()
    return
  }
  const token = localStorage.getItem('h5_token')
  const mustChangePassword = localStorage.getItem('h5_must_change_password') === '1'
  if (!token && to.path !== '/login') {
    next('/login')
  } else if (token && mustChangePassword && to.path !== '/change-password') {
    next('/change-password')
  } else if (to.path === '/change-password' && token && !mustChangePassword) {
    next('/home')
  } else if (to.path === '/login' && token) {
    next(mustChangePassword ? '/change-password' : '/home')
  } else {
    next()
  }
})

router.afterEach(to => {
  reportClientPerformance({
    kind: 'route',
    name: to.path,
    duration_ms: performance.now() - routeStartedAt,
  })
})

export default router
