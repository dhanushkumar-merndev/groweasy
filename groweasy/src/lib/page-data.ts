import { api } from "@/lib/api-client"
import { CLIENT_CACHE_KEYS, prefetchCachedResource } from "@/lib/client-cache"
import type { HistoryLog, ImportJob, Template } from "@/lib/types"

export type DashboardData = {
  imports: ImportJob[]
  templates: Template[]
}

export type CampaignsData = DashboardData
export type AnalyticsData = DashboardData

export async function loadTemplates() {
  const response = await api("/templates")
  if (!response.ok) throw new Error("Unable to load templates.")

  const { templates } = (await response.json()) as { templates: Template[] }
  return templates
}

export async function loadImportsAndTemplates(errorMessage: string) {
  const [importsResponse, templatesResponse] = await Promise.all([
    api("/imports"),
    api("/templates"),
  ])

  if (!importsResponse.ok || !templatesResponse.ok) {
    throw new Error(errorMessage)
  }

  const [{ imports }, { templates }] = await Promise.all([
    importsResponse.json() as Promise<{ imports: ImportJob[] }>,
    templatesResponse.json() as Promise<{ templates: Template[] }>,
  ])

  return { imports, templates }
}

export function loadDashboardData() {
  return loadImportsAndTemplates("Unable to load dashboard.")
}

export function loadCampaignsData() {
  return loadImportsAndTemplates("Unable to load campaigns.")
}

export function loadAnalyticsData() {
  return loadImportsAndTemplates("Unable to load analytics.")
}

export async function loadExportHistory() {
  const response = await api("/history?type=export")
  if (!response.ok) throw new Error("Unable to load history.")

  const { history } = (await response.json()) as { history: HistoryLog[] }
  return history
}

const pagePrefetchers: Record<string, () => Promise<unknown>> = {
  "/dashboard": () => prefetchCachedResource({ cacheKey: CLIENT_CACHE_KEYS.dashboard, load: loadDashboardData }),
  "/upload": () => prefetchCachedResource({ cacheKey: CLIENT_CACHE_KEYS.templatesList, load: loadTemplates }),
  "/templates": () => prefetchCachedResource({ cacheKey: CLIENT_CACHE_KEYS.templatesList, load: loadTemplates }),
  "/campaigns": () => prefetchCachedResource({ cacheKey: CLIENT_CACHE_KEYS.campaignsList, load: loadCampaignsData }),
  "/analytics": () => prefetchCachedResource({ cacheKey: CLIENT_CACHE_KEYS.analyticsList, load: loadAnalyticsData }),
  "/history": () => prefetchCachedResource({ cacheKey: CLIENT_CACHE_KEYS.historyExport, load: loadExportHistory }),
}

export function prefetchPageData(pathname: string) {
  return pagePrefetchers[pathname]?.().catch(() => null) ?? Promise.resolve(null)
}

export function prefetchWorkspaceData() {
  return Promise.all(Object.values(pagePrefetchers).map((prefetch) => prefetch().catch(() => null)))
}
