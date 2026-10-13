let pendingScript

function loadPlaid() {
  if (window.Plaid) {
    return Promise.resolve(window.Plaid)
  }
  if (pendingScript) {
    return pendingScript
  }
  pendingScript = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
    script.async = true
    script.onload = () => {
      if (window.Plaid) {
        resolve(window.Plaid)
        return
      }
      pendingScript = null
      reject(new Error('Plaid Link could not be loaded.'))
    }
    script.onerror = () => {
      pendingScript = null
      reject(new Error('Plaid Link could not be loaded.'))
    }
    document.head.appendChild(script)
  })
  return pendingScript
}

export function openPlaidLink(linkToken) {
  return loadPlaid().then(
    (Plaid) =>
      new Promise((resolve, reject) => {
        let settled = false
        const handler = Plaid.create({
          token: linkToken,
          onSuccess(publicToken, metadata) {
            if (settled) {
              return
            }
            settled = true
            handler.destroy()
            resolve({
              publicToken,
              institutionName: metadata?.institution?.name || '',
            })
          },
          onExit(error) {
            if (settled) {
              return
            }
            settled = true
            handler.destroy()
            if (error) {
              reject(new Error('The bank connection window closed before finishing.'))
              return
            }
            resolve(null)
          },
        })
        handler.open()
      }),
  )
}
