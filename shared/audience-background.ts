import {
  KeyAudienceEnabled,
  KeyAudienceRevision,
  KeyExtensionStatus,
} from '../storage-keys'
import {
  AUDIENCE_MESSAGE,
  audienceRoute,
  sanitizeAudienceMember,
  type AudiencePacket,
} from './audience'
import { createAudienceRepository } from './audience-db'
import { AppError, toTransferable } from './errors'
export function registerAudienceBackground() {
  const db = createAudienceRepository()
  browser.runtime.onMessage.addListener((m, sender, respond) => {
    if (m?.type !== AUDIENCE_MESSAGE || sender.id !== browser.runtime.id) return
    const extension =
      !!sender.url?.startsWith(browser.runtime.getURL('/')) &&
      /\/(popup|options)\.html(?:[?#]|$)/.test(sender.url)
    const x =
      /^https:\/\/(x\.com|twitter\.com|mobile\.twitter\.com)\//.test(
        sender.url || '',
      ) && sender.frameId === 0
    if (!extension && !x) return
    void (async () => {
      const changed = () =>
        browser.storage.local.set({
          [KeyAudienceRevision]: crypto.randomUUID(),
        })
      // Local records remain accessible from settings, even without an open X tab.
      if (extension) {
        if (m.action === 'list') return db.list()
        if (m.action === 'read' && typeof m.key === 'string')
          return db.read(m.key)
        if (m.action === 'clear' && /^\d+$/.test(m.account)) {
          const result = await db.clear(
            m.account,
            typeof m.key === 'string' ? m.key : undefined,
          )
          await changed()
          return result
        }
        throw new AppError('error.libraryBadSource')
      }
      const storeId = (sender.tab as { cookieStoreId?: string } | undefined)
        ?.cookieStoreId
      const url = new URL(sender.url!),
        cookie = await browser.cookies.get({
          url: url.origin,
          name: 'twid',
          ...(storeId ? { storeId } : {}),
        })
      let account = ''
      try {
        account =
          decodeURIComponent(cookie?.value || '')
            .replace(/"/g, '')
            .match(/^u=(\d+)$/)?.[1] || ''
      } catch {}
      if (!account || (m.account && m.account !== account))
        throw new AppError('error.accountChanged')
      if (m.action === 'hello')
        return { account, generation: await db.generation(account) }
      if (m.action === 'read') {
        const record = await db.read(String(m.key))
        if (record && record.account !== account)
          throw new AppError('error.accountChanged')
        return record
      }
      if (m.action === 'list')
        return (await db.list()).filter((s) => s.account === account)
      if (m.action === 'clear') {
        if (typeof m.key !== 'string' || !m.key.startsWith(`${account}:`))
          throw new AppError('error.libraryBadSource')
        const generation = await db.clear(account, m.key)
        await changed()
        return generation
      }
      if (m.action !== 'add') throw new AppError('error.libraryBadSource')
      const settings = await browser.storage.local.get([
        KeyAudienceEnabled,
        KeyExtensionStatus,
      ])
      if (
        settings[KeyAudienceEnabled] !== 'on' ||
        settings[KeyExtensionStatus] === 'off'
      )
        return { state: 'disabled' }
      const route = audienceRoute(url.pathname),
        packet = m.packet as AudiencePacket
      if (
        !route ||
        !packet ||
        packet.kind !== route.kind ||
        packet.handle?.toLowerCase() !== route.handle.toLowerCase() ||
        !/^\d{1,30}$/.test(packet.targetId) ||
        !Array.isArray(packet.members)
      )
        throw new AppError('error.libraryBadSource')
      const now = Date.now()
      const members = packet.members
        .slice(0, 1000)
        .map((member) => sanitizeAudienceMember(member, now))
        .filter((member): member is NonNullable<typeof member> => !!member)
      // Relationships are meaningful only for the signed-in account's following list.
      if (packet.targetId !== account || packet.kind !== 'following')
        for (const member of members) delete member.followsYou
      const total =
        typeof packet.total === 'number' &&
        Number.isSafeInteger(packet.total) &&
        packet.total >= 0
          ? packet.total
          : undefined
      const result = await db.add(
        account,
        Number(m.generation),
        {
          targetId: packet.targetId,
          handle: route.handle,
          kind: route.kind,
          total,
          members,
        },
        now,
      )
      if (result.state === 'saved' || result.state === 'capacity')
        await changed()
      return result
    })().then(
      (result) => respond({ ok: true, result }),
      (error) =>
        respond({
          ok: false,
          error: toTransferable(error, 'error.readFailed'),
        }),
    )
    return true
  })
}
