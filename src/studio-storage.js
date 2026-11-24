async function studioStore(mode, action) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('fosfeno-sectores', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('sesion')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('sesion', mode)
      const request = action(transaction.objectStore('sesion'))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = transaction.onerror = () =>
        reject(transaction.error || new Error('No se pudo acceder a la biblioteca de Fosfeno.'))
    })
  } finally {
    db.close()
  }
}
