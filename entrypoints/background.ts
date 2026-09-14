import { migrateSpamStorage } from '../shared/spam-migration'

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void migrateSpamStorage()
  })
})
