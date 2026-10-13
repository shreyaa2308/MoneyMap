const TOKEN_KEY = 'moneymap_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

function cleanMessage(message) {
  return String(message).replace(/^Value error,\s*/i, '')
}

function readError(data, status) {
  if (typeof data?.detail === 'string') {
    return cleanMessage(data.detail)
  }
  if (Array.isArray(data?.detail) && data.detail.length > 0) {
    return data.detail
      .map((item) => {
        const text = cleanMessage(item?.msg || 'Check this field')
        const loc = Array.isArray(item?.loc) ? item.loc.filter((part) => part !== 'body') : []
        const field = loc.length ? String(loc[loc.length - 1]).replaceAll('_', ' ') : ''
        return field ? `${field}: ${text}` : text
      })
      .join(' ')
  }
  return `Request failed (${status})`
}

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {})
  const token = getToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  let response
  try {
    response = await fetch(path, { ...options, headers })
  } catch {
    const error = new Error('Cannot reach the server. Check that the backend is running.')
    error.status = 0
    throw error
  }
  if (response.status === 204) {
    return null
  }

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(readError(data, response.status))
    error.status = response.status
    throw error
  }
  return data
}
