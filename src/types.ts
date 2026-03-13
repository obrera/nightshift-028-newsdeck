export interface StoryHit {
  objectID: string
  title: string | null
  story_title: string | null
  url: string | null
  story_url: string | null
  author: string
  points: number | null
  num_comments: number | null
  created_at: string
  created_at_i: number
}

export interface SearchResponse {
  hits: StoryHit[]
  page: number
  nbPages: number
  nbHits: number
}

export type SortField = 'created_at_i' | 'points' | 'num_comments'
export type SortDirection = 'asc' | 'desc'
export type PriorityTag = 'must-read' | 'follow-up' | 'skim'

export interface QueueItem {
  storyId: string
  title: string
  author: string
  url: string
  createdAt: string
  points: number
  comments: number
  priority: PriorityTag
  notes: string
  savedAt: string
}

export interface CompareSlots {
  left: string | null
  right: string | null
}

