const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';

export async function tavilySearch(
  apiKey: string,
  query: string,
  options?: { maxResults?: number },
): Promise<unknown> {
  const maxResults = options?.maxResults ?? 5;
  const res = await fetch(TAVILY_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Tavily HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<unknown>;
}
