import { describe, expect, it } from 'vitest'
import {
  audienceCsv,
  audienceRoute,
  audienceStats,
  mergeAudienceMember,
  parseAudienceResponse,
  queryAudience,
  sanitizeAudienceMember,
  type AudienceMember,
  type AudienceSnapshot,
} from '../../shared/audience'
const member = (id: string, n?: number): AudienceMember => ({
  id,
  handle: `user${id}`,
  followers: n,
  observedAt: 100,
})
const snapshot = (members: AudienceMember[]): AudienceSnapshot => ({
  key: '1:1:following',
  account: '1',
  targetId: '1',
  kind: 'following',
  handle: 'owner',
  batch: 'test',
  startedAt: 100,
  updatedAt: 200,
  count: members.length,
  bytes: 0,
  members,
})
const url = (operation = 'Followers', id = '1') =>
  `https://x.com/i/api/graphql/hash/${operation}?variables=${encodeURIComponent(JSON.stringify({ userId: id }))}`
const entry = (id = '2', legacy: Record<string, unknown> = {}) => ({
  entryId: `user-${id}`,
  content: {
    itemContent: {
      itemType: 'TimelineUser',
      user_results: {
        result: {
          __typename: 'User',
          rest_id: id,
          legacy: {
            screen_name: `user${id}`,
            followers_count: 0,
            followed_by: false,
            ...legacy,
          },
        },
      },
    },
  },
})
const response = (entries: unknown[]) => ({
  data: {
    user: {
      result: {
        timeline: {
          timeline: { instructions: [{ type: 'TimelineAddEntries', entries }] },
        },
      },
    },
  },
})
describe('audience parser and analysis', () => {
  it('uses request userId when list response omits target metadata; preserves explicit zero and false', () => {
    const result = parseAudienceResponse(
      url(),
      response([entry()]),
      '/owner/followers',
      500,
    )!
    expect(result.targetId).toBe('1')
    expect(result.members).toEqual([
      {
        id: '2',
        handle: 'user2',
        followers: 0,
        followsYou: false,
        observedAt: 500,
      },
    ])
  })
  it('accepts modern core/count/relationship fields and deduplicates list entries', () => {
    const e = entry()
    const u = e.content.itemContent.user_results.result as any
    u.core = { screen_name: 'modern', name: '新版' }
    u.relationship_counts = { followers: 10000, following: 0 }
    u.relationship_perspectives = { followed_by: true }
    const result = parseAudienceResponse(
      url(),
      response([e, e]),
      '/owner/followers',
    )!
    expect(result.members).toHaveLength(1)
    expect(result.members[0]).toMatchObject({
      handle: 'modern',
      followers: 10000,
      following: 0,
      followsYou: true,
    })
  })
  it('rejects wrong operations, list routes, targets and handles', () => {
    for (const op of [
      'BlueVerifiedFollowers',
      'FollowersYouKnow',
      'UserTweets',
      'Following',
    ])
      expect(
        parseAudienceResponse(url(op), response([entry()]), '/owner/followers'),
      ).toBeNull()
    expect(audienceRoute('/owner/verified_followers')).toBeNull()
    const r: any = response([entry()])
    r.data.user.result.rest_id = '999'
    expect(parseAudienceResponse(url(), r, '/owner/followers')).toBeNull()
    r.data.user.result.rest_id = '1'
    r.data.user.result.core = { screen_name: 'someoneElse' }
    expect(parseAudienceResponse(url(), r, '/owner/followers')).toBeNull()
  })
  it('does not include recommendation modules, tweets, promoted or mismatched user IDs', () => {
    const e = entry(),
      promoted: any = entry('3')
    promoted.content.itemContent.promotedMetadata = {}
    const mismatch = entry('4')
    mismatch.content.itemContent.user_results.result.rest_id = '5'
    const result = parseAudienceResponse(
      url(),
      response([
        { entryId: 'who-to-follow', content: { items: [e] } },
        {
          entryId: 'tweet-8',
          content: {
            itemContent: {
              tweet_results: {
                result: {
                  core: { user_results: e.content.itemContent.user_results },
                },
              },
            },
          },
        },
        promoted,
        mismatch,
        e,
      ]),
      '/owner/followers',
    )!
    expect(result.members.map((m) => m.id)).toEqual(['2'])
  })
  it('ignores malformed numbers and unsafe avatars', () => {
    expect(
      sanitizeAudienceMember({
        id: '2',
        handle: 'u',
        followers: -1,
        following: '0',
        avatar: 'javascript:alert(1)',
        createdAt: Infinity,
      }),
    ).not.toHaveProperty('followers')
    expect(
      sanitizeAudienceMember({ id: '2', handle: 'u', followers: NaN }),
    ).not.toHaveProperty('followers')
    expect(sanitizeAudienceMember({ id: 'x', handle: 'u' })).toBeNull()
  })
  it('six bins are exclusive, thresholds overlap, and unknowns do not enter the denominator', () => {
    const stats = audienceStats(
      [
        0,
        2999,
        3000,
        9999,
        10000,
        29999,
        30000,
        49999,
        50000,
        99999,
        100000,
        undefined,
      ].map((n, i) => member(String(i), n)),
    )
    expect(stats).toEqual({
      count: 12,
      known: 11,
      unknown: 1,
      bins: [2, 2, 2, 2, 2, 1],
      cumulative: [9, 7, 5],
    })
  })
  it('merges each field by observation time without deleting missing fields', () => {
    const old = mergeAudienceMember(undefined, {
      ...member('1', 100),
      name: 'old',
      following: 4,
      observedAt: 10,
    })
    const newer = mergeAudienceMember(old, {
      ...member('1', undefined),
      name: 'new',
      followsYou: false,
      observedAt: 30,
    })
    const result = mergeAudienceMember(newer, {
      ...member('1', 200),
      name: 'late',
      following: 0,
      createdAt: 1,
      observedAt: 20,
    })
    expect(result).toMatchObject({
      name: 'new',
      followers: 200,
      following: 0,
      createdAt: 1,
      followsYou: false,
      observedAt: 30,
    })
  })
  it('only own following lists expose relationship filters; missing differs from false', () => {
    const s = snapshot([
      { ...member('1', 100), followsYou: false },
      { ...member('2', 100), followsYou: true },
      member('3', 100),
    ])
    expect(queryAudience(s, { relation: 'no' }).map((m) => m.id)).toEqual(['1'])
    expect(queryAudience(s, { relation: 'unknown' }).map((m) => m.id)).toEqual([
      '3',
    ])
    expect(
      queryAudience({ ...s, targetId: '999' }, { relation: 'no' }),
    ).toHaveLength(3)
  })
  it('combines attribute filters and sorts zero-following / unknown ratios last', () => {
    const s = snapshot([
      { ...member('1', 20000), following: 100, createdAt: 100 },
      { ...member('2', 30000), following: 0, createdAt: 1 },
      { ...member('3', 10000), following: 10, createdAt: 200 },
      member('4'),
    ])
    expect(queryAudience(s, { sort: 'ratio' }).map((m) => m.id)).toEqual([
      '3',
      '1',
      '2',
      '4',
    ])
    expect(
      queryAudience(s, { large: true, recent: true }, 90 * 86400000 + 150).map(
        (m) => m.id,
      ),
    ).toEqual(['3'])
    expect(queryAudience(s, { large: true, small: true })).toEqual([])
  })
  it('exports every supplied result with BOM, quoted newlines and formula protection', () => {
    const members = Array.from({ length: 25 }, (_, i) => ({
      ...member(String(i), i),
      name: i === 0 ? '=HYPERLINK("x")' : i === 1 ? 'line\nnext' : 'normal',
    }))
    const csv = audienceCsv(snapshot(members), members)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('"\'=HYPERLINK(""x"")"')
    expect(csv).toContain('"line\nnext"')
    expect(csv).toContain('"user24"')
    expect(csv).toContain('missing_fields')
  })
})
