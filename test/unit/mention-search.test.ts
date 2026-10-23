import { describe, expect, it } from 'vitest'
import { buildMentionSearchUrl, findMentionQuery, parseMentionUsers } from '../../shared/mention-search'

describe('findMentionQuery', () => {
  it('光标前以 @ 加中文名结尾时返回名字和 @ 的位置', () => {
    expect(findMentionQuery('你好 @宝玉')).toEqual({ query: '宝玉', start: 3 })
    expect(findMentionQuery('@宝玉')).toEqual({ query: '宝玉', start: 0 })
    expect(findMentionQuery('你好@宝玉')).toEqual({ query: '宝玉', start: 2 })
  })

  it('认全角 @，名字里可以混英文', () => {
    expect(findMentionQuery('＠歸藏')).toEqual({ query: '歸藏', start: 0 })
    expect(findMentionQuery('@歸藏guizang')).toEqual({ query: '歸藏guizang', start: 0 })
  })

  it('纯英文名交给 X 自己的候选框', () => {
    expect(findMentionQuery('@Elon')).toBeNull()
    expect(findMentionQuery('hi @dotey_2')).toBeNull()
  })

  it('名字后面已经有空格或断句标点时不查', () => {
    expect(findMentionQuery('@宝玉 ')).toBeNull()
    expect(findMentionQuery('@宝玉，')).toBeNull()
    expect(findMentionQuery('@宝玉。')).toBeNull()
  })

  it('@ 前面是字母数字时不算艾特', () => {
    expect(findMentionQuery('mail@宝玉')).toBeNull()
    expect(findMentionQuery('2@宝玉')).toBeNull()
  })

  it('名字超过 30 个字符时不查', () => {
    expect(findMentionQuery(`@${'名'.repeat(30)}`)?.query).toBe('名'.repeat(30))
    expect(findMentionQuery(`@${'名'.repeat(31)}`)).toBeNull()
  })
})

describe('buildMentionSearchUrl', () => {
  it('查 X 的用户查询接口，名字放在 q 里', () => {
    const url = new URL(buildMentionSearchUrl('宝玉'))
    expect(url.origin + url.pathname).toBe('https://x.com/i/api/1.1/search/typeahead.json')
    expect(url.searchParams.get('q')).toBe('宝玉')
    expect(url.searchParams.get('src')).toBe('compose')
    expect(url.searchParams.get('result_type')).toBe('users')
  })
})

describe('parseMentionUsers', () => {
  const user = (handle: string, extra: Record<string, unknown> = {}) => ({
    id_str: `id-${handle}`,
    name: `名字 ${handle}`,
    screen_name: handle,
    profile_image_url_https: `https://pbs.twimg.com/profile_images/1/${handle}_normal.jpg`,
    ext_is_blue_verified: false,
    social_context: { following: false, followed_by: false },
    ...extra,
  })

  it('已关注的排前面，其余保持 X 的顺序', () => {
    const users = parseMentionUsers({
      users: [
        user('first'),
        user('followed', { social_context: { following: true } }),
        user('third', { ext_is_blue_verified: true }),
      ],
    })
    expect(users.map(u => u.handle)).toEqual(['followed', 'first', 'third'])
    expect(users[0]).toMatchObject({ id: 'id-followed', name: '名字 followed', following: true, verified: false })
    expect(users[2].verified).toBe(true)
    expect(users[1].avatar).toBe('https://pbs.twimg.com/profile_images/1/first_normal.jpg')
  })

  it('丢掉无效的用户名、重复账号和 X 图床以外的头像', () => {
    const users = parseMentionUsers({
      users: [
        user('bad handle'),
        user('ok', { profile_image_url_https: 'https://example.com/a.jpg' }),
        user('OK'),
        null,
        user('noname', { name: '  ' }),
      ],
    })
    expect(users.map(u => u.handle)).toEqual(['ok', 'noname'])
    expect(users[0].avatar).toBe('')
    expect(users[1].name).toBe('noname')
  })

  it('返回格式不对时给空列表', () => {
    expect(parseMentionUsers(null)).toEqual([])
    expect(parseMentionUsers({ users: 'x' })).toEqual([])
    expect(parseMentionUsers({})).toEqual([])
  })
})
