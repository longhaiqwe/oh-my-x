import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { createLibraryRepository } from '../../shared/own-post-library-db'
import { emptyLibrary } from '../../shared/own-post-library'

// 只在这个文件里提供 IndexedDB：reply-score-db 的测试要求全局没有 IndexedDB
beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()) })
afterEach(() => { vi.unstubAllGlobals() })

function openAt(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

describe('自己帖子库的 IndexedDB 存储', () => {
  it('没存过的账号读出空库', async () => {
    const repo = createLibraryRepository('db-empty')
    expect(await repo.read('42')).toEqual(emptyLibrary('42'))
  })

  it('update 的改动会保存，返回 change 的返回值，账号之间互不影响', async () => {
    const repo = createLibraryRepository('db-write')
    const value = await repo.update('42', state => { state.meta.paused = true; return 'done' })
    expect(value).toBe('done')
    expect((await repo.read('42')).meta.paused).toBe(true)
    expect((await repo.read('43')).meta.paused).toBe(false)
  })

  it('换一个仓库实例也能读到已保存的数据', async () => {
    await createLibraryRepository('db-reopen').update('42', state => { state.meta.error = 'x' })
    expect((await createLibraryRepository('db-reopen').read('42')).meta.error).toBe('x')
  })

  it('read 里改了状态也不会保存', async () => {
    const repo = createLibraryRepository('db-readonly')
    const state = await repo.read('42')
    state.meta.paused = true
    expect((await repo.read('42')).meta.paused).toBe(false)
  })

  it('change 抛错时整笔回滚，并把这个错误交给调用方', async () => {
    const repo = createLibraryRepository('db-abort')
    const boom = new Error('boom')
    await expect(repo.update('42', state => { state.meta.paused = true; throw boom })).rejects.toBe(boom)
    expect((await repo.read('42')).meta.paused).toBe(false)
  })

  it('打开失败时报错，之后可以重新打开', async () => {
    (await openAt('db-version', 2)).close()
    const repo = createLibraryRepository('db-version')
    await expect(repo.read('42')).rejects.toMatchObject({ name: 'VersionError' })
    await new Promise<void>((resolve) => { indexedDB.deleteDatabase('db-version').onsuccess = () => resolve() })
    expect(await repo.read('42')).toEqual(emptyLibrary('42'))
  })

  it('别处要升级数据库时让出连接，不挡住升级', async () => {
    const repo = createLibraryRepository('db-upgrade')
    await repo.read('42')
    const upgraded = await openAt('db-upgrade', 2)
    expect(upgraded.version).toBe(2)
    upgraded.close()
  })
})
