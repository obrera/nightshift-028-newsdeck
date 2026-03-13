import type { SearchResponse, StoryHit } from '../types'

const API_URL = 'https://hn.algolia.com/api/v1/search'

function normalizeStory(hit: StoryHit): StoryHit | null {
  const title = hit.title ?? hit.story_title
  const url = hit.url ?? hit.story_url

  if (!title || !url) {
    return null
  }

  return {
    ...hit,
    title,
    url,
    points: hit.points ?? 0,
    num_comments: hit.num_comments ?? 0,
  }
}

export async function fetchStories(query: string, signal?: AbortSignal): Promise<SearchResponse> {
  const params = new URLSearchParams({
    query,
    tags: 'story',
    hitsPerPage: '50',
    page: '0',
  })

  const response = await fetch(`${API_URL}?${params.toString()}`, {
    headers: {
      accept: 'application/json',
    },
    signal,
  })

  if (!response.ok) {
    throw new Error(`Hacker News Algolia request failed with status ${response.status}.`)
  }

  const payload = (await response.json()) as SearchResponse

  return {
    ...payload,
    hits: payload.hits.map(normalizeStory).filter((story): story is StoryHit => story !== null),
  }
}

