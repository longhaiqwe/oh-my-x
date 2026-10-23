import './style.css'

import { createApp, h } from 'vue'
import OptionsApp from './OptionsApp.vue'

import SettingsReady from '../popup/components/ui/SettingsReady.vue'

createApp({ render: () => h(SettingsReady, null, { default: () => h(OptionsApp) }) }).mount('#app')
