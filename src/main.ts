import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import { useFleetStore } from './stores/fleet'
import './styles/base.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(i18n)

/**
 * The URL owns the machine selection.
 *
 * Registered after pinia so the store is available, and before the router is
 * installed so the guard runs on the very first navigation -- otherwise a
 * cold load of a machine route would render before anything is selected.
 */
router.beforeEach((to) => {
  const id = to.params.id
  if (typeof id === 'string' && id) {
    if (!useFleetStore().machines.some((machine) => machine.id === id)) {
      return { name: 'not-found', params: { pathMatch: to.path.slice(1).split('/') }, replace: true }
    }
    useFleetStore().select(id)
  }
})

app.use(router)
app.mount('#app')
