export const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:4000"

export function api(path: string, init?: RequestInit) {
  return fetch(`${API_BASE}/api${path}`, {
    ...init,
    credentials: "include",
  })
}
