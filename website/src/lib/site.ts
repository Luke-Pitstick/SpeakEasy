// SPDX-FileCopyrightText: 2026 SpeakEasy contributors
// SPDX-License-Identifier: GPL-3.0-only

export const REPO = 'Luke-Pitstick/SpeakEasy'
export const REPO_URL = `https://github.com/${REPO}`

let starCount: Promise<number | null> | undefined

/**
 * The repository's star count, read once per build. Returns null when GitHub cannot be
 * reached, and the header then shows the link without a number.
 */
export function getStarCount(): Promise<number | null> {
  starCount ??= loadStarCount()
  return starCount
}

async function loadStarCount(): Promise<number | null> {
  const token = process.env.GITHUB_TOKEN
  try {
    const response = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'speakeasy-site-build',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      signal: AbortSignal.timeout(8000)
    })
    if (!response.ok) return null
    const body: unknown = await response.json()
    if (typeof body !== 'object' || body === null) return null
    const count = (body as { stargazers_count?: unknown }).stargazers_count
    return typeof count === 'number' && Number.isFinite(count) ? count : null
  } catch {
    return null
  }
}

export function formatCount(count: number): string {
  if (count < 1000) return String(count)
  const thousands = count / 1000
  return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1).replace(/\.0$/, '')}k`
}
