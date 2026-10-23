import { describe, expect, it } from 'vitest'
import { BOT_ACCOUNT_LIMIT, parseBotAccounts, updateBotAccounts } from '../../shared/reply-bot-accounts'

describe('机器人账号列表', () => {
  it('整理成小写用户名：去掉 @、不合法的和重复的，保持顺序', () => {
    expect(parseBotAccounts(['Bob', '@carl', 'bob', 'has space', '', 5, 'a'.repeat(16), 'dan_1'])).toEqual(['bob', 'carl', 'dan_1'])
    expect(parseBotAccounts('bob')).toEqual([])
    expect(parseBotAccounts(undefined)).toEqual([])
  })

  it('加入、移出；没变化时返回原数组；超出上限去掉最早的', () => {
    const list = ['bob']
    expect(updateBotAccounts(list, 'Carl', true)).toEqual(['bob', 'carl'])
    expect(updateBotAccounts(list, 'BOB', true)).toBe(list)
    expect(updateBotAccounts(list, 'bob', false)).toEqual([])
    expect(updateBotAccounts(list, 'carl', false)).toBe(list)
    expect(updateBotAccounts(list, 'not valid!', true)).toBe(list)
    const full = Array.from({ length: BOT_ACCOUNT_LIMIT }, (_, i) => `u${i}`)
    const next = updateBotAccounts(full, 'newest', true)
    expect(next).toHaveLength(BOT_ACCOUNT_LIMIT)
    expect(next[0]).toBe('u1')
    expect(next.at(-1)).toBe('newest')
  })
})
