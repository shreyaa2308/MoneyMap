export function dollarsToCents(value) {
  const trimmed = String(value).trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null
  }
  const [whole, fraction = ''] = trimmed.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (cents <= 0) {
    return null
  }
  return cents
}

export function centsToInput(cents) {
  const absolute = Math.abs(cents)
  const dollars = Math.floor(absolute / 100)
  const remainder = String(absolute % 100).padStart(2, '0')
  return `${dollars}.${remainder}`
}

export function formatCents(cents) {
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${centsToInput(cents)}`
}

export function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function shiftMonth(month, delta) {
  const [year, monthNumber] = month.split('-').map(Number)
  const next = new Date(year, monthNumber - 1 + delta, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

export function formatMonthLabel(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber - 1, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  })
}

export function todayInput() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}
