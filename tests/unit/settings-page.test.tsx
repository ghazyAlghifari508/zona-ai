import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getSelectedModelPreference,
  MODEL_PREFERENCE_KEY,
  resetModelPreferenceForTesting,
} from '../../src/lib/models/preference'
import {
  getSelectedSkillPreference,
  resetSkillPreferenceForTesting,
  SKILL_PREFERENCE_KEY,
} from '../../src/lib/chat/skill-preference'

const deleteAllMock = vi.fn().mockResolvedValue({ success: true })

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  createFileRoute: () => (opts: { component: React.ComponentType }) => {
    const Comp = opts.component
    const routeObj = {
      ...opts,
      useNavigate: () => vi.fn(),
      useLoaderData: () => ({
        session: {
          user: {
            id: 'user-1',
            name: 'Ghazy Alghifari',
            email: 'alghifarighazy508@gmail.com',
            createdAt: '2026-01-15T00:00:00.000Z',
          },
        },
        creditBalance: 100,
      }),
    }
    ;(Comp as unknown as { Route: typeof routeObj }).Route = routeObj
    return routeObj
  },
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string
    children: React.ReactNode
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  redirect: vi.fn(),
}))

vi.mock('../../src/lib/auth/auth-client', () => ({
  authClient: {
    useSession: vi.fn(() => ({
      data: {
        user: {
          id: 'user-1',
          name: 'Ghazy Alghifari',
          email: 'alghifarighazy508@gmail.com',
          createdAt: '2026-01-15T00:00:00.000Z',
        },
      },
      isPending: false,
    })),
    hydrateSession: vi.fn(),
    signOut: vi.fn(),
  },
}))

vi.mock('../../src/components/layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="mock-sidebar">Sidebar</div>,
}))

vi.mock('../../src/components/layout/CreditWidget', () => ({
  CreditWidget: () => null,
}))

vi.mock('../../src/server/functions/conversations', () => ({
  deleteAllConversations: () => deleteAllMock(),
  getConversations: vi.fn().mockResolvedValue({ conversations: [] }),
}))

vi.mock('../../src/server/functions/session', () => ({
  getCurrentSession: vi.fn(),
}))

vi.mock('../../src/server/functions/credits', () => ({
  getCreditBalanceFn: vi.fn().mockResolvedValue({ balance: 100 }),
}))

vi.mock('../../src/components/chat/useModelCatalog', () => ({
  useModelCatalog: () => [
    { id: 'auto', displayName: 'Auto (Smart Router)' },
    { id: 'gpt-5.6-sol', displayName: 'GPT 5.6 (Sol)' },
    { id: 'gemini-3.7-flash-high', displayName: 'Gemini 3.7 Flash (High)' },
    { id: 'qwen3.8-flash', displayName: 'Qwen 3.8 Flash' },
    { id: 'mimo-v2.5', displayName: 'MiMo V2.5' },
    { id: 'hy3', displayName: 'HY3' },
    { id: 'glm-5.3-flash', displayName: 'GLM 5.3 Flash' },
  ],
}))

import { Route } from '../../src/routes/settings'

describe('Settings Page', () => {
  beforeEach(() => {
    cleanup()
    localStorage.clear()
    resetModelPreferenceForTesting()
    resetSkillPreferenceForTesting()
    deleteAllMock.mockClear()
  })

  afterEach(cleanup)

  function renderPage() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    return render(
      <QueryClientProvider client={queryClient}>
        <Route.component />
      </QueryClientProvider>,
    )
  }

  it('renders page header and account details properly', () => {
    renderPage()

    // Heading and subtitle
    expect(screen.getByText('Pengaturan')).toBeTruthy()
    expect(
      screen.getByText('Kelola akun dan preferensi ZonaAI Anda.'),
    ).toBeTruthy()

    // User details
    expect(screen.getByText('Ghazy Alghifari')).toBeTruthy()
    expect(screen.getAllByText('alghifarighazy508@gmail.com').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Google')).toBeTruthy()
    expect(screen.getByText(/Standar \(100 Kredit\)/)).toBeTruthy()
    expect(screen.getByText('Dikelola oleh akun Google Anda (hanya-baca).')).toBeTruthy()
  })

  it('changes default model and persists to localStorage and reactive store', () => {
    renderPage()

    const select = screen.getByTestId('default-model-select') as HTMLSelectElement
    expect(select.value).toBe('auto')

    // Change to gemini-3.7-flash-high
    fireEvent.change(select, { target: { value: 'gemini-3.7-flash-high' } })

    expect(getSelectedModelPreference()).toBe('gemini-3.7-flash-high')
    expect(localStorage.getItem(MODEL_PREFERENCE_KEY)).toBe('gemini-3.7-flash-high')
  })

  it('changes default skill and persists to localStorage and reactive store', () => {
    renderPage()

    const select = screen.getByTestId('default-skill-select') as HTMLSelectElement
    expect(select.value).toBe('none')

    // Change to prd-plan
    fireEvent.change(select, { target: { value: 'prd-plan' } })

    expect(getSelectedSkillPreference()).toBe('prd-plan')
    expect(localStorage.getItem(SKILL_PREFERENCE_KEY)).toBe('prd-plan')
  })

  it('opens confirmation dialog when clicking Hapus Semua Percakapan and cancels on Batal', () => {
    renderPage()

    const deleteBtn = screen.getByTestId('delete-all-conversations-btn')
    fireEvent.click(deleteBtn)

    // Dialog appears
    expect(screen.getByText('Hapus Semua Percakapan?')).toBeTruthy()
    expect(screen.getByTestId('confirm-delete-all-btn')).toBeTruthy()

    // Click Batal
    const cancelBtn = screen.getByRole('button', { name: 'Batal' })
    fireEvent.click(cancelBtn)

    expect(deleteAllMock).not.toHaveBeenCalled()
  })

  it('executes deleteAllConversations when confirmed in dialog and displays success banner', async () => {
    renderPage()

    const deleteBtn = screen.getByTestId('delete-all-conversations-btn')
    fireEvent.click(deleteBtn)

    const confirmBtn = screen.getByTestId('confirm-delete-all-btn')
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(deleteAllMock).toHaveBeenCalledTimes(1)
    })

    expect(await screen.findByTestId('delete-success-banner')).toBeTruthy()
  })

  it('calls authClient.signOut when clicking Keluar in Account section', async () => {
    const { authClient } = await import('../../src/lib/auth/auth-client')
    renderPage()

    const signOutBtn = screen.getByTestId('settings-sign-out')
    fireEvent.click(signOutBtn)

    expect(authClient.signOut).toHaveBeenCalled()
  })
})

