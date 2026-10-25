const DB_NAME = 'crew-terminal-voice'
const STORE = 'voice'

function openVoiceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Не вдалося відкрити сховище аудіо'))
  })
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Помилка сховища аудіо'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Помилка сховища аудіо'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Сховище аудіо перервано'))
  })
}

export async function putAudio(key: string, blob: Blob): Promise<void> {
  const database = await openVoiceDb()
  try {
    const transaction = database.transaction(STORE, 'readwrite')
    await Promise.all([
      requestResult(transaction.objectStore(STORE).put(blob, key)),
      transactionDone(transaction),
    ])
  } finally {
    database.close()
  }
}

export async function getAudio(key: string): Promise<Blob | null> {
  const database = await openVoiceDb()
  try {
    const transaction = database.transaction(STORE, 'readonly')
    const [result] = await Promise.all([
      requestResult(transaction.objectStore(STORE).get(key)),
      transactionDone(transaction),
    ])
    return result instanceof Blob ? result : null
  } finally {
    database.close()
  }
}

export async function deleteAudio(key: string): Promise<void> {
  const database = await openVoiceDb()
  try {
    const transaction = database.transaction(STORE, 'readwrite')
    await Promise.all([
      requestResult(transaction.objectStore(STORE).delete(key)),
      transactionDone(transaction),
    ])
  } finally {
    database.close()
  }
}
