import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArtifactCanvas } from '../../src/components/artifacts/ArtifactCanvas'
import type {
  ArtifactDetail,
  ArtifactSummary,
} from '../../src/lib/artifacts/contracts'
import type { ArtifactWorkspaceState } from '../../src/lib/artifacts/workspace-state'

vi.mock('../../src/components/chat/useModelCatalog', () => ({
  useModelCatalog: () => [
    { id: 'model-a', displayName: 'Model Alpha', provider: 'zona' },
    { id: 'model-b', displayName: 'Model Beta', provider: 'zona' },
  ],
  findCatalogEntry: (
    catalog: Array<{ id: string; displayName: string }>,
    id: string,
  ) => catalog.find((entry) => entry.id === id) ?? null,
}))

const ART_A = '11111111-1111-4111-8111-111111111111'
const ART_B = '22222222-2222-4222-8222-222222222222'
const VER_A1 = 'a0000000-0000-4000-8000-000000000001'
const VER_A2 = 'a0000000-0000-4000-8000-000000000002'
const VER_B1 = 'b0000000-0000-4000-8000-000000000001'

function summaryFor(
  overrides: Partial<ArtifactSummary> & Pick<ArtifactSummary, 'artifactId'>,
): ArtifactSummary {
  const isB = overrides.artifactId === ART_B
  return {
    kind: 'prd',
    title: isB ? 'Beta Spec' : 'Alpha Spec',
    attachmentId: isB
      ? 'bbbbbbbb-0000-4000-8000-000000000001'
      : 'aaaaaaaa-0000-4000-8000-000000000001',
    fileName: isB ? 'beta.md' : 'alpha.md',
    fileSize: 128,
    mimeType: 'text/markdown',
    modelId: isB ? 'model-b' : 'model-a',
    routerModelId: isB ? 'router-b' : 'router-a',
    currentVersionId: isB ? VER_B1 : VER_A1,
    currentVersion: 1,
    versionCount: isB ? 1 : 2,
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    ...overrides,
  }
}

function detailFor(summary: ArtifactSummary): ArtifactDetail {
  if (summary.artifactId === ART_B) {
    return {
      ...summary,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      versions: [
        {
          versionId: VER_B1,
          attachmentId: summary.attachmentId,
          generationId: '99999999-9999-4999-8999-999999999999',
          title: summary.title,
          fileName: summary.fileName,
          fileSize: summary.fileSize,
          mimeType: 'text/markdown',
          version: 1,
          modelId: summary.modelId,
          routerModelId: summary.routerModelId,
          sourceVersionId: null,
          changeSummary: 'initial',
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
        },
      ],
    }
  }
  return {
    ...summary,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    versions: [
      {
        versionId: VER_A1,
        attachmentId: 'aaaaaaaa-0000-4000-8000-000000000001',
        generationId: '88888888-8888-4888-8888-888888888888',
        title: summary.title,
        fileName: 'alpha.md',
        fileSize: 128,
        mimeType: 'text/markdown',
        version: 1,
        modelId: summary.modelId,
        routerModelId: summary.routerModelId,
        sourceVersionId: null,
        changeSummary: 'initial',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      {
        versionId: VER_A2,
        attachmentId: 'aaaaaaaa-0000-4000-8000-000000000002',
        generationId: '88888888-8888-4888-8888-888888888889',
        title: summary.title,
        fileName: 'alpha.md',
        fileSize: 140,
        mimeType: 'text/markdown',
        version: 2,
        modelId: summary.modelId,
        routerModelId: summary.routerModelId,
        sourceVersionId: VER_A1,
        changeSummary: 'revision',
        createdAt: new Date('2026-09-02T00:00:00.000Z'),
      },
    ],
  }
}

const summaryA = summaryFor({ artifactId: ART_A })
const summaryB = summaryFor({ artifactId: ART_B })

function workspaceFor(
  overrides: Partial<ArtifactWorkspaceState> = {},
): ArtifactWorkspaceState {
  return {
    openArtifactIds: [ART_A, ART_B],
    activeArtifactId: ART_A,
    activeVersionByArtifactId: { [ART_A]: VER_A1, [ART_B]: VER_B1 },
    scrollTopByVersionKey: {},
    isArtifactPanelOpen: true,
    ...overrides,
  }
}

type CanvasCallbacks = {
  onSelectTab: ReturnType<typeof vi.fn>
  onVersionChange: ReturnType<typeof vi.fn>
  onCloseTab: ReturnType<typeof vi.fn>
  onClosePanel: ReturnType<typeof vi.fn>
  onBackToChat: ReturnType<typeof vi.fn>
  onCopy: ReturnType<typeof vi.fn>
  onRememberScroll: ReturnType<typeof vi.fn>
}

function setup(
  options: {
    workspace?: ArtifactWorkspaceState
    bodies?: Record<string, string>
    status?: number
  } = {},
) {
  const fetchMock = vi.fn((url: string) => {
    if (options.status !== undefined && options.status !== 200) {
      return Promise.resolve(
        new Response('oops', {
          status: options.status,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }
    const body = options.bodies?.[url] ?? `# Preview ${url}`
    return Promise.resolve(
      new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      }),
    )
  })
  vi.stubGlobal('fetch', fetchMock)

  const callbacks: CanvasCallbacks = {
    onSelectTab: vi.fn(),
    onVersionChange: vi.fn(),
    onCloseTab: vi.fn(),
    onClosePanel: vi.fn(),
    onBackToChat: vi.fn(),
    onCopy: vi.fn(),
    onRememberScroll: vi.fn(),
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const workspace = options.workspace ?? workspaceFor()
  render(
    <QueryClientProvider client={client}>
      <ArtifactCanvas
        summaries={[summaryA, summaryB]}
        detailsByArtifactId={{
          [ART_A]: detailFor(summaryA),
          [ART_B]: detailFor(summaryB),
        }}
        workspace={workspace}
        onSelectTab={callbacks.onSelectTab}
        onVersionChange={callbacks.onVersionChange}
        onCloseTab={callbacks.onCloseTab}
        onClosePanel={callbacks.onClosePanel}
        onBackToChat={callbacks.onBackToChat}
        onCopy={callbacks.onCopy}
        onRememberScroll={callbacks.onRememberScroll}
      />
    </QueryClientProvider>,
  )
  return { fetchMock, callbacks, client }
}

describe('ArtifactCanvas', () => {
  beforeEach(() => {
    vi.stubGlobal('clipboard', undefined)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('exposes the active artifact name on the selected tab', async () => {
    setup({
      bodies: { [`/api/artifacts/${ART_A}/versions/${VER_A1}`]: '# Alpha' },
    })
    const selectedTab = await screen.findByRole('tab', { selected: true })
    expect(selectedTab.getAttribute('aria-label')).toContain('Alpha Spec')
    expect(screen.getByRole('heading', { name: 'Alpha Spec' })).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Alpha' })).toBeTruthy(),
    )
  })

  it('emits exact ids when selecting a tab and a version', async () => {
    const { callbacks } = setup({
      bodies: { [`/api/artifacts/${ART_A}/versions/${VER_A1}`]: '# Alpha' },
    })
    await screen.findByRole('tab', { selected: true })

    fireEvent.click(screen.getByRole('tab', { name: /Beta Spec/ }))
    expect(callbacks.onSelectTab).toHaveBeenCalledTimes(1)
    expect(callbacks.onSelectTab).toHaveBeenCalledWith(ART_B)

    fireEvent.change(screen.getByLabelText(/Version for Alpha Spec/), {
      target: { value: VER_A2 },
    })
    expect(callbacks.onVersionChange).toHaveBeenCalledTimes(1)
    expect(callbacks.onVersionChange).toHaveBeenCalledWith({
      artifactId: ART_A,
      versionId: VER_A2,
    })
  })

  it('passes the exact loaded source to Copy', async () => {
    const exact = '# Exact bytes\n\n- item'
    const { callbacks } = setup({
      bodies: { [`/api/artifacts/${ART_A}/versions/${VER_A1}`]: exact },
    })
    await waitFor(() => expect(screen.getByText('item')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Copy Alpha Spec/ }))
    expect(callbacks.onCopy).toHaveBeenCalledTimes(1)
    expect(callbacks.onCopy).toHaveBeenCalledWith(exact)
  })

  it('copies a loaded empty source without treating it as unavailable', async () => {
    const { callbacks } = setup({
      bodies: { [`/api/artifacts/${ART_A}/versions/${VER_A1}`]: '' },
    })
    const copy = await screen.findByRole('button', { name: /Copy Alpha Spec/ })
    await waitFor(() => expect(copy.hasAttribute('disabled')).toBe(false))

    fireEvent.click(copy)

    expect(callbacks.onCopy).toHaveBeenCalledTimes(1)
    expect(callbacks.onCopy).toHaveBeenCalledWith('')
  })

  it('keeps Download from emitting open or focus callbacks', async () => {
    const { callbacks } = setup({
      bodies: { [`/api/artifacts/${ART_A}/versions/${VER_A1}`]: '# Alpha' },
    })
    await screen.findByRole('tab', { selected: true })

    const download = screen.getByRole('link', { name: /Download/ })
    expect(download.getAttribute('href')).toBe(
      '/api/attachments/aaaaaaaa-0000-4000-8000-000000000001?download=1',
    )
    expect(download.getAttribute('download')).toBe('alpha.md')
    download.addEventListener('click', (event) => event.preventDefault(), {
      once: true,
    })
    fireEvent.click(download)
    expect(callbacks.onSelectTab).not.toHaveBeenCalled()
    expect(callbacks.onVersionChange).not.toHaveBeenCalled()
    expect(callbacks.onCloseTab).not.toHaveBeenCalled()
  })

  it('isolates preview loading, error, and retry to the active artifact', async () => {
    let rejectFirst = false
    const fetchMock = vi.fn((url: string) => {
      if (rejectFirst && url.includes(VER_A1)) {
        return Promise.resolve(
          new Response('gone', {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      return Promise.resolve(
        new Response('# Preview body', {
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        }),
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const callbacks: CanvasCallbacks = {
      onSelectTab: vi.fn(),
      onVersionChange: vi.fn(),
      onCloseTab: vi.fn(),
      onClosePanel: vi.fn(),
      onBackToChat: vi.fn(),
      onCopy: vi.fn(),
      onRememberScroll: vi.fn(),
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <ArtifactCanvas
          summaries={[summaryA, summaryB]}
          detailsByArtifactId={{
            [ART_A]: detailFor(summaryA),
            [ART_B]: detailFor(summaryB),
          }}
          workspace={workspaceFor()}
          onSelectTab={callbacks.onSelectTab}
          onVersionChange={callbacks.onVersionChange}
          onCloseTab={callbacks.onCloseTab}
          onClosePanel={callbacks.onClosePanel}
          onBackToChat={callbacks.onBackToChat}
          onCopy={callbacks.onCopy}
          onRememberScroll={callbacks.onRememberScroll}
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Preview body')).toBeTruthy()

    rejectFirst = true
    await client.invalidateQueries({
      queryKey: ['artifact-content', ART_A, VER_A1],
    })
    // Force the active query into error by refetching through the UI retry path later;
    // first prove the error surface appears after invalidation-driven refetch.
    await waitFor(() => expect(screen.queryByRole('alert')).toBeTruthy())
    const retry = screen.getByRole('button', { name: /Retry/ })
    rejectFirst = false
    fireEvent.click(retry)
    await waitFor(() => expect(screen.getByText('Preview body')).toBeTruthy())
  })

  it('emits onBackToChat from the mobile back control', async () => {
    const { callbacks } = setup({
      bodies: { [`/api/artifacts/${ART_A}/versions/${VER_A1}`]: '# Alpha' },
    })
    await screen.findByRole('tab', { selected: true })
    fireEvent.click(screen.getByRole('button', { name: /Back to chat/ }))
    expect(callbacks.onBackToChat).toHaveBeenCalledTimes(1)
  })

  it('supports keyboard tab navigation with labeled close controls', async () => {
    const { callbacks } = setup({
      bodies: { [`/api/artifacts/${ART_A}/versions/${VER_A1}`]: '# Alpha' },
    })
    const activeTab = await screen.findByRole('tab', { selected: true })
    activeTab.focus()
    fireEvent.keyDown(activeTab, { key: 'ArrowRight' })
    expect(callbacks.onSelectTab).toHaveBeenCalledWith(ART_B)

    expect(
      screen.getByRole('button', { name: 'Close Alpha Spec' }),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close Alpha Spec' }))
    expect(callbacks.onCloseTab).toHaveBeenCalledWith(ART_A)
  })

  it('does not switch tabs when navigation keys originate from a close control', async () => {
    const { callbacks } = setup({
      bodies: { [`/api/artifacts/${ART_A}/versions/${VER_A1}`]: '# Alpha' },
    })
    await screen.findByRole('tab', { selected: true })
    const close = screen.getByRole('button', { name: 'Close Alpha Spec' })
    close.focus()

    fireEvent.keyDown(close, { key: 'ArrowRight' })

    expect(callbacks.onSelectTab).not.toHaveBeenCalled()
  })

  it('ignores an empty version selection', async () => {
    const { callbacks } = setup({
      bodies: { [`/api/artifacts/${ART_A}/versions/${VER_A1}`]: '# Alpha' },
    })
    await screen.findByRole('tab', { selected: true })

    fireEvent.change(screen.getByLabelText(/Version for Alpha Spec/), {
      target: { value: '' },
    })

    expect(callbacks.onVersionChange).not.toHaveBeenCalled()
  })

  it('records and restores version-keyed preview scroll around tab switches', async () => {
    const { callbacks } = setup({
      workspace: workspaceFor({
        scrollTopByVersionKey: { [`${ART_A}:${VER_A1}`]: 37 },
      }),
      bodies: { [`/api/artifacts/${ART_A}/versions/${VER_A1}`]: '# Alpha' },
    })
    const preview = await screen.findByTestId('artifact-preview')
    await waitFor(() => expect(preview.scrollTop).toBe(37))
    preview.scrollTop = 91

    fireEvent.click(screen.getByRole('tab', { name: /Beta Spec/ }))

    expect(callbacks.onRememberScroll).toHaveBeenCalledWith({
      artifactId: ART_A,
      versionId: VER_A1,
      scrollTop: 91,
    })
    expect(callbacks.onSelectTab).toHaveBeenCalledWith(ART_B)
  })

  it('renders the version selector in immutable order', async () => {
    setup({
      bodies: { [`/api/artifacts/${ART_A}/versions/${VER_A1}`]: '# Alpha' },
    })
    await screen.findByRole('tab', { selected: true })
    const options = screen.getAllByRole('option').map((option) => ({
      value: option.getAttribute('value'),
      selected: (option as HTMLOptionElement).selected,
    }))
    expect(options.map((option) => option.value)).toEqual([VER_A1, VER_A2])
    expect(options.find((option) => option.value === VER_A1)?.selected).toBe(
      true,
    )
  })

  it('emits header close tab and close panel callbacks', async () => {
    const { callbacks } = setup({
      bodies: { [`/api/artifacts/${ART_A}/versions/${VER_A1}`]: '# Alpha' },
    })
    await screen.findByRole('tab', { selected: true })

    fireEvent.click(
      screen.getByRole('button', { name: 'Close Alpha Spec tab' }),
    )
    expect(callbacks.onCloseTab).toHaveBeenCalledWith(ART_A)

    fireEvent.click(
      screen.getByRole('button', { name: 'Close artifact panel' }),
    )
    expect(callbacks.onClosePanel).toHaveBeenCalledTimes(1)
  })
})
