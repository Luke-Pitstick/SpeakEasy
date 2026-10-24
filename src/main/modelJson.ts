export async function postModelJson(
  key: string,
  endpoint: string,
  body: unknown,
  signal: AbortSignal,
  fetcher: typeof fetch
): Promise<unknown> {
  const response = await fetcher(`https://openrouter.ai/api/v1/${endpoint}`, {
    method: 'POST',
    signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok || !response.body)
    throw Error('Model provider unavailable. Check the API key, connection, or credits and retry.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = '',
    size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.length
      if (size > 128000) throw Error('Model response exceeded the size limit.')
      text += decoder.decode(chunk.value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
