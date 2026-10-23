import './style.css'

import { createApp, h } from 'vue'
import App from './App.vue'

import SettingsReady from './components/ui/SettingsReady.vue'

createApp({ render: () => h(SettingsReady, null, { default: () => h(App) }) }).mount('#app')
