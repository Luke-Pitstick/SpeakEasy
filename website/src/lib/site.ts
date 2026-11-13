// SPDX-FileCopyrightText: 2026 SpeakEasy contributors
// SPDX-License-Identifier: GPL-3.0-only

export const REPO = 'Luke-Pitstick/SpeakEasy'
export const REPO_URL = `https://github.com/${REPO}`

let starCount: Promise<number | null> | undefined
let latestRelease: Promise<Release | null> | undefined

/** Reads a GitHub REST API path. Returns null when GitHub cannot be reached or answers with an error. */
async function fetchGitHub(path: string): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN
  try {
    const response = await fetch(`https://api.github.com/${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'speakeasy-site-build',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

/**
 * The repository's star count, read once per build. Returns null when GitHub cannot be
 * reached, and the header then shows the link without a number.
 */
export function getStarCount(): Promise<number | null> {
  starCount ??= loadStarCount()
  return starCount
}

async function loadStarCount(): Promise<number | null> {
  const body = await fetchGitHub(`repos/${REPO}`)
  if (typeof body !== 'object' || body === null) return null
  const count = (body as { stargazers_count?: unknown }).stargazers_count
  return typeof count === 'number' && Number.isFinite(count) ? count : null
}

export interface ReleaseAsset {
  name: string
  size: number
  url: string
}

export interface Release {
  tag: string
  url: string
  publishedAt: Date
  assets: ReleaseAsset[]
}

/**
 * The newest published release (GitHub skips drafts and prereleases), read once per build. The
 * Website workflow rebuilds the site whenever a release is published, so the download links follow
 * it. Returns null when GitHub cannot be reached or nothing has been published.
 */
export function getLatestRelease(): Promise<Release | null> {
  latestRelease ??= loadLatestRelease()
  return latestRelease
}

async function loadLatestRelease(): Promise<Release | null> {
  const body = await fetchGitHub(`repos/${REPO}/releases/latest`)
  if (typeof body !== 'object' || body === null) return null
  const { tag_name, html_url, published_at, assets } = body as Record<string, unknown>
  if (typeof tag_name !== 'string' || typeof html_url !== 'string') return null
  if (typeof published_at !== 'string' || !Array.isArray(assets)) return null
  const publishedAt = new Date(published_at)
  if (Number.isNaN(publishedAt.getTime())) return null
  return {
    tag: tag_name,
    url: html_url,
    publishedAt,
    assets: assets.flatMap((asset: unknown): ReleaseAsset[] => {
      if (typeof asset !== 'object' || asset === null) return []
      const { name, size, browser_download_url } = asset as Record<string, unknown>
      if (typeof name !== 'string' || typeof size !== 'number') return []
      if (typeof browser_download_url !== 'string') return []
      return [{ name, size, url: browser_download_url }]
    })
  }
}

export function formatBytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`
}

export function formatCount(count: number): string {
  if (count < 1000) return String(count)
  const thousands = count / 1000
  return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1).replace(/\.0$/, '')}k`
}
