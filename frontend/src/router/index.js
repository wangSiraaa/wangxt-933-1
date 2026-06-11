import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/orders'
  },
  {
    path: '/orders',
    name: 'Orders',
    component: () => import('../views/OrderList.vue')
  },
  {
    path: '/orders/:id',
    name: 'OrderDetail',
    component: () => import('../views/OrderDetail.vue')
  },
  {
    path: '/refunds',
    name: 'Refunds',
    component: () => import('../views/RefundList.vue')
  },
  {
    path: '/refunds/:id',
    name: 'RefundDetail',
    component: () => import('../views/RefundDetail.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
