import { KeyCreatorRewardsPayoutHistory } from '../storage-keys'

export interface RewardsPayoutRecord {
  fromAt: number
  observedAt: number
  changeCents: number
}

export interface RewardsPayoutLedger {
  totalCents: number
  observedAt: number
  records: RewardsPayoutRecord[]
}

type Ledgers = Record<string, RewardsPayoutLedger>

export async function readRewardsAccount(): Promise<string | undefined> {
  try {
    const cookie = await browser.cookies.get({ url: 'https://x.com', name: 'twid' })
    return decodeURIComponent(cookie?.value || '').replace(/"/g, '').match(/^u=(\d+)$/)?.[1]
  } catch {
    return undefined
  }
}

export function rewardsLedgerFor(raw: unknown, account: string | undefined): RewardsPayoutLedger | undefined {
  if (!account || !raw || typeof raw !== 'object') return undefined
  const ledger = (raw as Ledgers)[account]
  if (!ledger || !Number.isSafeInteger(ledger.totalCents) || !Number.isFinite(ledger.observedAt) || !Array.isArray(ledger.records)) return undefined
  return ledger
}

let pendingWrite: Promise<void> = Promise.resolve()

/** 只有后台从 X 读取的金额进入记录。串行保存，避免自动刷新与手动刷新写入同一差值。 */
export function recordRewardsPayout(account: string, amount: string, observedAt: number): Promise<void> {
  if (!/^\$\d+(?:,\d{3})*\.\d{2}$/.test(amount)) return Promise.resolve()
  const totalCents = Number(amount.replace(/[$,.]/g, ''))
  if (!Number.isSafeInteger(totalCents)) return Promise.resolve()

  const write = pendingWrite.then(async () => {
    const storage = browser.storage.local
    const raw = (await storage.get(KeyCreatorRewardsPayoutHistory))[KeyCreatorRewardsPayoutHistory]
    const ledgers: Ledgers = raw && typeof raw === 'object' ? raw as Ledgers : {}
    const previous = rewardsLedgerFor(ledgers, account)
    if (previous && previous.observedAt >= observedAt) return
    const records = previous?.records ?? []
    const changeCents = totalCents - (previous?.totalCents ?? totalCents)
    await storage.set({
      [KeyCreatorRewardsPayoutHistory]: {
        ...ledgers,
        [account]: {
          totalCents,
          observedAt,
          records: previous && changeCents !== 0
            ? [{ fromAt: previous.observedAt, observedAt, changeCents }, ...records]
            : records,
        },
      },
    })
  })
  pendingWrite = write.catch(() => {})
  return write
}
