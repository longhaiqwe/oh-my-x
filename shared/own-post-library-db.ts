import { emptyLibrary, type LibraryRepository, type LibraryState } from './own-post-library'

/** Extension-origin database: page scripts cannot read it, and no credentials are stored. */
export function createLibraryRepository(name = 'oh-my-x-own-posts'): LibraryRepository {
  let opening: Promise<IDBDatabase> | undefined
  const open = () => opening ||= new Promise<IDBDatabase>((resolve,reject) => {
    const request = indexedDB.open(name,1)
    request.onupgradeneeded = () => request.result.createObjectStore('accounts',{keyPath:'account'})
    request.onsuccess = () => { request.result.onversionchange=()=>{request.result.close();opening=undefined};resolve(request.result) }
    request.onerror = () => { opening=undefined;reject(request.error) }
    request.onblocked = () => { opening=undefined;reject(new Error('本地数据库正在升级，请关闭其他 X 标签后重试')) }
  })
  const transaction = async <T>(account: string, mode: IDBTransactionMode, change: (state: LibraryState)=>T): Promise<T> => {
    const db = await open()
    return new Promise((resolve,reject) => {
      const tx=db.transaction('accounts',mode), store=tx.objectStore('accounts')
      let result:T, failure:unknown
      const request=store.get(account)
      request.onsuccess=()=>{
        try { const state:LibraryState=request.result || emptyLibrary(account);result=change(state);if(mode==='readwrite')store.put(state) }
        catch(error){failure=error;tx.abort()}
      }
      tx.oncomplete=()=>resolve(result)
      tx.onabort=tx.onerror=()=>reject(failure || tx.error || new Error('本地缓存写入失败'))
    })
  }
  return {read:account=>transaction(account,'readonly',s=>s),update:(account,change)=>transaction(account,'readwrite',change)}
}
