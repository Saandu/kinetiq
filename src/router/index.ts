import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import DashboardPage from '@/pages/DashboardPage.vue'
import { brand } from '@/config/brand'

/**
 * Routes are explicit, and the machine id lives in the URL so a machine view
 * is linkable and survives a refresh.
 */
const routes: RouteRecordRaw[] = [
  { path: '/', name: 'dashboard', component: DashboardPage, meta: { title: 'Dashboard' } },
  {
    path: '/machines/:id',
    name: 'machine',
    component: () => import('@/pages/MachineDetailPage.vue'),
    meta: { title: 'Machine' },
  },
  {
    path: '/machines/:id/notifications',
    name: 'notifications',
    component: () => import('@/pages/NotificationsPage.vue'),
    meta: { title: 'Notifications' },
  },
  {
    path: '/machines/:id/settings',
    name: 'settings',
    component: () => import('@/pages/SettingsPage.vue'),
    meta: { title: 'Settings' },
  },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/pages/NotFoundPage.vue') },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
})

router.afterEach((to) => {
  const title = (to.meta.title as string | undefined) ?? ''
  document.title = title ? `${title} · ${brand.name}` : brand.name
})
