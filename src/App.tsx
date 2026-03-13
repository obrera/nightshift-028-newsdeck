import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { fetchStories } from './lib/api'
import { formatCompactNumber, formatRelativeTime, formatStoryDate, getHostname } from './lib/format'
import type { CompareSlots, PriorityTag, QueueItem, SortDirection, SortField, StoryHit } from './types'

const STORAGE_KEY = 'newsdeck.reading-queue'

const sortLabels: Record<SortField, string> = {
  created_at_i: 'Date',
  num_comments: 'Comments',
  points: 'Points',
}

const priorityOptions: PriorityTag[] = ['must-read', 'follow-up', 'skim']

function readQueue(): QueueItem[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as unknown

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item): item is QueueItem => {
      if (!item || typeof item !== 'object') {
        return false
      }

      const candidate = item as Record<string, unknown>
      return (
        typeof candidate.storyId === 'string' &&
        typeof candidate.title === 'string' &&
        typeof candidate.author === 'string' &&
        typeof candidate.url === 'string' &&
        typeof candidate.createdAt === 'string' &&
        typeof candidate.points === 'number' &&
        typeof candidate.comments === 'number' &&
        typeof candidate.priority === 'string' &&
        typeof candidate.notes === 'string' &&
        typeof candidate.savedAt === 'string'
      )
    })
  } catch {
    return []
  }
}

function sortStories(stories: StoryHit[], field: SortField, direction: SortDirection): StoryHit[] {
  const ordered = [...stories]
  const multiplier = direction === 'asc' ? 1 : -1

  ordered.sort((left, right) => {
    const leftValue = field === 'created_at_i' ? left.created_at_i : (left[field] ?? 0)
    const rightValue = field === 'created_at_i' ? right.created_at_i : (right[field] ?? 0)
    return (leftValue - rightValue) * multiplier
  })

  return ordered
}

function App() {
  const [search, setSearch] = useState('react')
  const [stories, setStories] = useState<StoryHit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField>('points')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [minPoints, setMinPoints] = useState(0)
  const [minComments, setMinComments] = useState(0)
  const [compareSlots, setCompareSlots] = useState<CompareSlots>({ left: null, right: null })
  const [queue, setQueue] = useState<QueueItem[]>(() => readQueue())
  const deferredSearch = useDeferredValue(search.trim())

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  }, [queue])

  useEffect(() => {
    const controller = new AbortController()

    const loadStories = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetchStories(deferredSearch || 'react', controller.signal)

        startTransition(() => {
          setStories(response.hits)
          setLastUpdated(new Date().toISOString())
          setCompareSlots((current) => ({
            left: current.left && response.hits.some((story) => story.objectID === current.left) ? current.left : response.hits[0]?.objectID ?? null,
            right:
              current.right && response.hits.some((story) => story.objectID === current.right)
                ? current.right
                : response.hits[1]?.objectID ?? response.hits[0]?.objectID ?? null,
          }))
        })
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load stories.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadStories()

    return () => controller.abort()
  }, [deferredSearch])

  const filteredStories = sortStories(
    stories.filter((story) => (story.points ?? 0) >= minPoints && (story.num_comments ?? 0) >= minComments),
    sortField,
    sortDirection,
  )

  const queueById = new Map(queue.map((item) => [item.storyId, item]))
  const storyById = new Map(stories.map((story) => [story.objectID, story]))
  const leftStory = compareSlots.left ? storyById.get(compareSlots.left) ?? null : null
  const rightStory = compareSlots.right ? storyById.get(compareSlots.right) ?? null : null

  const totalPoints = filteredStories.reduce((sum, story) => sum + (story.points ?? 0), 0)
  const totalComments = filteredStories.reduce((sum, story) => sum + (story.num_comments ?? 0), 0)

  function setCompare(side: 'left' | 'right', storyId: string) {
    setCompareSlots((current) => ({ ...current, [side]: storyId }))
  }

  function upsertQueue(story: StoryHit, existing?: QueueItem) {
    const normalizedTitle = story.title ?? story.story_title
    const normalizedUrl = story.url ?? story.story_url

    if (!normalizedTitle || !normalizedUrl) {
      return
    }

    setQueue((current) => {
      const nextItem: QueueItem = {
        storyId: story.objectID,
        title: normalizedTitle,
        author: story.author,
        url: normalizedUrl,
        createdAt: story.created_at,
        points: story.points ?? 0,
        comments: story.num_comments ?? 0,
        priority: existing?.priority ?? 'must-read',
        notes: existing?.notes ?? '',
        savedAt: existing?.savedAt ?? new Date().toISOString(),
      }

      const filtered = current.filter((item) => item.storyId !== story.objectID)
      return [nextItem, ...filtered]
    })
  }

  function updateQueueItem(storyId: string, updates: Partial<Pick<QueueItem, 'priority' | 'notes'>>) {
    setQueue((current) =>
      current.map((item) =>
        item.storyId === storyId
          ? {
              ...item,
              ...updates,
            }
          : item,
      ),
    )
  }

  function removeQueueItem(storyId: string) {
    setQueue((current) => current.filter((item) => item.storyId !== storyId))
  }

  function exportQueue() {
    const blob = new Blob([JSON.stringify(queue, null, 2)], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'newsdeck-reading-queue.json'
    anchor.click()
    window.URL.revokeObjectURL(url)
  }

  async function importQueue(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as QueueItem[]

      if (!Array.isArray(parsed)) {
        throw new Error('Imported file must contain an array.')
      }

      setQueue(
        parsed.filter(
          (item) =>
            typeof item.storyId === 'string' &&
            typeof item.title === 'string' &&
            typeof item.url === 'string' &&
            typeof item.priority === 'string' &&
            typeof item.notes === 'string',
        ),
      )
      setError(null)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import failed.')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <main className="min-h-screen bg-transparent text-slate-50">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(7,10,18,0.9))] px-5 py-6 shadow-[0_40px_120px_rgba(0,0,0,0.45)] sm:px-8 sm:py-8">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/60 to-transparent" />
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.25fr)_360px]">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-sky-300/80">Nightshift build 028</p>
              <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                NewsDeck
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                Search Hacker News stories, compare breakout posts side-by-side, and keep a persistent reading queue with priorities, notes, and portable JSON.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <StatCard label="Results" value={String(filteredStories.length)} accent="sky" />
              <StatCard label="Points tracked" value={formatCompactNumber(totalPoints)} accent="amber" />
              <StatCard label="Queue items" value={String(queue.length)} accent="emerald" />
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_380px]">
          <div className="panel-surface rounded-[1.75rem] p-4 sm:p-5">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,150px))]">
              <label className="flex flex-col gap-2 text-sm text-copy-dim">
                Search stories
                <input
                  className="focus-ring rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500"
                  placeholder="Search HN topics, companies, frameworks..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-copy-dim">
                Sort metric
                <select
                  className="focus-ring rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  value={sortField}
                  onChange={(event) => setSortField(event.target.value as SortField)}
                >
                  {Object.entries(sortLabels).map(([value, label]) => (
                    <option key={value} value={value} className="bg-slate-900">
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm text-copy-dim">
                Direction
                <select
                  className="focus-ring rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  value={sortDirection}
                  onChange={(event) => setSortDirection(event.target.value as SortDirection)}
                >
                  <option value="desc" className="bg-slate-900">
                    High to low
                  </option>
                  <option value="asc" className="bg-slate-900">
                    Low to high
                  </option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm text-copy-dim">
                Min points
                <input
                  className="focus-ring rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  type="number"
                  min="0"
                  value={minPoints}
                  onChange={(event) => setMinPoints(Number(event.target.value) || 0)}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-copy-dim">
                Min comments
                <input
                  className="focus-ring rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                  type="number"
                  min="0"
                  value={minComments}
                  onChange={(event) => setMinComments(Number(event.target.value) || 0)}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-copy-dim">
              <span>{loading ? 'Refreshing stories…' : `${formatCompactNumber(totalComments)} comments across visible results`}</span>
              <span>{lastUpdated ? `Updated ${formatStoryDate(lastUpdated)}` : 'Waiting for first sync'}</span>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
            ) : null}

            <div className="mt-5 grid gap-3">
              {loading ? (
                <LoadingCards />
              ) : filteredStories.length === 0 ? (
                <EmptyState />
              ) : (
                filteredStories.map((story) => {
                  const inQueue = queueById.get(story.objectID)
                  const safeTitle = story.title ?? story.story_title ?? 'Untitled story'
                  const safeUrl = story.url ?? story.story_url ?? '#'

                  return (
                    <article
                      key={story.objectID}
                      className="rounded-[1.5rem] border border-white/8 bg-white/[0.035] p-4 transition hover:border-sky-300/30 hover:bg-white/[0.06]"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                            <span>{getHostname(safeUrl)}</span>
                            <span className="h-1 w-1 rounded-full bg-slate-600" />
                            <span>{formatRelativeTime(story.created_at_i)}</span>
                          </div>
                          <h2 className="mt-2 text-lg font-semibold text-white sm:text-xl">{safeTitle}</h2>
                          <p className="mt-2 text-sm leading-6 text-slate-300">
                            by {story.author} • {story.points ?? 0} points • {story.num_comments ?? 0} comments
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <CompareButton
                            active={compareSlots.left === story.objectID}
                            label="Compare left"
                            onClick={() => setCompare('left', story.objectID)}
                          />
                          <CompareButton
                            active={compareSlots.right === story.objectID}
                            label="Compare right"
                            onClick={() => setCompare('right', story.objectID)}
                          />
                          <button
                            type="button"
                            className="focus-ring rounded-full border border-sky-300/30 bg-sky-400/10 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20"
                            onClick={() => upsertQueue(story, inQueue)}
                          >
                            {inQueue ? 'Refresh queue item' : 'Add to queue'}
                          </button>
                          <a
                            href={safeUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="focus-ring rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-white/10"
                          >
                            Open story
                          </a>
                        </div>
                      </div>
                    </article>
                  )
                })
              )}
            </div>
          </div>

          <div className="grid gap-4">
            <section className="panel-surface rounded-[1.75rem] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-sky-300/75">Side-by-side</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Story compare</h2>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-copy-dim">
                  {leftStory && rightStory ? '2 stories loaded' : 'Choose stories'}
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                <ComparePanel story={leftStory} title="Left story" />
                <ComparePanel story={rightStory} title="Right story" />
              </div>
            </section>

            <section className="panel-surface rounded-[1.75rem] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">Persistent queue</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Reading queue</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="focus-ring rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100"
                    onClick={exportQueue}
                    disabled={queue.length === 0}
                  >
                    Export JSON
                  </button>
                  <label className="focus-ring rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100">
                    Import JSON
                    <input type="file" accept="application/json" className="sr-only" onChange={importQueue} />
                  </label>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {queue.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-copy-dim">
                    Queue is empty. Add stories from the results list to track reading priority and notes.
                  </div>
                ) : (
                  queue.map((item) => (
                    <article key={item.storyId} className="rounded-[1.5rem] border border-white/8 bg-white/[0.035] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold text-white">{item.title}</h3>
                          <p className="mt-1 text-sm text-copy-dim">
                            {item.author} • {item.points} points • {item.comments} comments
                          </p>
                        </div>
                        <button
                          type="button"
                          className="focus-ring rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-1.5 text-xs uppercase tracking-[0.2em] text-rose-200"
                          onClick={() => removeQueueItem(item.storyId)}
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-3 grid gap-3">
                        <label className="flex flex-col gap-2 text-sm text-copy-dim">
                          Priority
                          <select
                            className="focus-ring rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                            value={item.priority}
                            onChange={(event) =>
                              updateQueueItem(item.storyId, {
                                priority: event.target.value as PriorityTag,
                              })
                            }
                          >
                            {priorityOptions.map((priority) => (
                              <option key={priority} value={priority} className="bg-slate-900">
                                {priority}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-2 text-sm text-copy-dim">
                          Notes
                          <textarea
                            className="focus-ring min-h-24 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500"
                            placeholder="Capture why this matters, a quote to revisit, or next-step research."
                            value={item.notes}
                            onChange={(event) =>
                              updateQueueItem(item.storyId, {
                                notes: event.target.value,
                              })
                            }
                          />
                        </label>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-[0.2em] text-slate-500">
                          <span>Saved {formatStoryDate(item.savedAt)}</span>
                          <a href={item.url} target="_blank" rel="noreferrer" className="text-sky-300 hover:text-sky-200">
                            Visit link
                          </a>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: 'sky' | 'amber' | 'emerald'
}) {
  const accentStyles = {
    amber: 'from-amber-500/15 to-transparent text-amber-100',
    emerald: 'from-emerald-500/15 to-transparent text-emerald-100',
    sky: 'from-sky-500/15 to-transparent text-sky-100',
  }

  return (
    <article className={`rounded-[1.5rem] border border-white/10 bg-gradient-to-br ${accentStyles[accent]} px-4 py-4`}>
      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <strong className="mt-2 block text-2xl font-semibold">{value}</strong>
    </article>
  )
}

function CompareButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`focus-ring rounded-full px-4 py-2 text-sm font-medium transition ${
        active ? 'border border-amber-300/30 bg-amber-400/20 text-amber-100' : 'border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  )
}

function ComparePanel({ story, title }: { story: StoryHit | null; title: string }) {
  if (!story) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-copy-dim">
        {title} is empty. Choose a story from the result list.
      </div>
    )
  }

  const safeTitle = story.title ?? story.story_title ?? 'Untitled story'
  const safeUrl = story.url ?? story.story_url ?? '#'

  return (
    <article className="rounded-[1.5rem] border border-white/8 bg-white/[0.035] p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{title}</p>
      <h3 className="mt-2 text-lg font-semibold text-white">{safeTitle}</h3>
      <p className="mt-1 text-sm text-copy-dim">
        {story.author} • {getHostname(safeUrl)}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Metric label="Points" value={String(story.points ?? 0)} />
        <Metric label="Comments" value={String(story.num_comments ?? 0)} />
        <Metric label="Published" value={formatRelativeTime(story.created_at_i)} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 text-sm text-copy-dim">
        <span>{formatStoryDate(story.created_at)}</span>
        <a href={safeUrl} target="_blank" rel="noreferrer" className="text-sky-300 hover:text-sky-200">
          Open outbound
        </a>
      </div>
    </article>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/40 px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <strong className="mt-2 block text-sm font-semibold text-white">{value}</strong>
    </div>
  )
}

function LoadingCards() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="h-32 animate-pulse rounded-[1.5rem] border border-white/8 bg-[linear-gradient(90deg,rgba(255,255,255,0.03),rgba(255,255,255,0.08),rgba(255,255,255,0.03))]"
        />
      ))}
    </>
  )
}

function EmptyState() {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-copy-dim">
      No stories matched the current search and filters. Try a broader query or lower the thresholds.
    </div>
  )
}

export default App
