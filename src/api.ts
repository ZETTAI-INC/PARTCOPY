/**
 * Authenticated fetch wrapper.
 * Automatically includes X-API-Key header on all requests.
 */
const API_KEY = import.meta.env.VITE_PARTCOPY_API_KEY || ''

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  if (API_KEY) {
    headers.set('X-API-Key', API_KEY)
  }
  return fetch(input, { ...init, headers })
}
