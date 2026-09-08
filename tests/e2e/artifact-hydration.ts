import type { Page, Response } from '@playwright/test'

function isArtifactListResponse(response: Response): boolean {
  if (!response.ok()) return false
  const url = response.url()
  const marker = '/_serverFn/'
  const markerIndex = url.indexOf(marker)
  if (markerIndex === -1) return false
  const after = url.slice(markerIndex + marker.length)
  const segment = after.split('/')[0]?.split('?')[0]?.split('#')[0]
  if (!segment) return false
  let decoded: string
  try {
    decoded = Buffer.from(segment, 'base64url').toString('utf8')
  } catch {
    return false
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(decoded)
  } catch {
    return false
  }
  if (typeof parsed !== 'object' || parsed === null) return false
  if (!('file' in parsed) || !('export' in parsed)) return false
  const file = parsed.file
  const exported = parsed.export
  if (typeof file !== 'string' || typeof exported !== 'string') return false
  return (
    file.includes('server/functions/artifacts.ts') &&
    exported.includes('listConversationArtifacts')
  )
}

export function waitForArtifactListHydration(page: Page) {
  return page.waitForResponse(isArtifactListResponse, { timeout: 30_000 })
}

export async function gotoChatAndWaitForArtifactHydration(
  page: Page,
  url: string,
): Promise<void> {
  const gate = waitForArtifactListHydration(page)
  await page.goto(url)
  await gate
}

export async function reloadAndWaitForArtifactHydration(
  page: Page,
): Promise<void> {
  const gate = waitForArtifactListHydration(page)
  await page.reload()
  await gate
}
