const compactNumberFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const relativeDateFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function formatCompactNumber(value: number): string {
  return compactNumberFormatter.format(value)
}

export function formatStoryDate(dateString: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(dateString))
}

export function formatRelativeTime(unixSeconds: number): string {
  const deltaSeconds = unixSeconds - Math.floor(Date.now() / 1000)
  const absSeconds = Math.abs(deltaSeconds)

  if (absSeconds < 3600) {
    return relativeDateFormatter.format(Math.round(deltaSeconds / 60), 'minute')
  }

  if (absSeconds < 86400) {
    return relativeDateFormatter.format(Math.round(deltaSeconds / 3600), 'hour')
  }

  return relativeDateFormatter.format(Math.round(deltaSeconds / 86400), 'day')
}

export function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'external link'
  }
}

