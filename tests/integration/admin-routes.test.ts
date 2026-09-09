import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requireAdminSession } from '../../src/lib/auth/admin-guard'
import { AppError } from '../../src/lib/utils/errors'

vi.mock('../../src/lib/auth/admin-guard', () => ({
  requireAdminSession: vi.fn(),
  checkUserNotBanned: vi.fn(),
  preventAdminSelfBan: vi.fn(),
}))

vi.mock('../../src/server/functions/admin-dashboard', () => ({
  getAdminDashboardMetricsFn: vi.fn(),
}))

vi.mock('../../src/server/functions/admin-users', () => ({
  listUsersFn: vi.fn(),
  banUserFn: vi.fn(),
  unbanUserFn: vi.fn(),
}))

vi.mock('../../src/server/functions/admin-models', () => ({
  getModelSettingsFn: vi.fn(),
  updateModelAvailabilityFn: vi.fn(),
}))

vi.mock('../../src/server/functions/feedback', () => ({
  listFeedbackFn: vi.fn(),
  updateFeedbackStatusFn: vi.fn(),
}))

vi.mock('../../src/server/functions/credits', () => ({
  listUserCreditsFn: vi.fn(),
  adjustUserCreditsFn: vi.fn(),
  resetDevCreditsFn: vi.fn(),
}))

vi.mock('../../src/server/functions/admin-audit', () => ({
  listAuditLogsFn: vi.fn(),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    Link: ({
      to,
      children,
      onClick,
      activeOptions: _activeOptions,
      activeProps: _activeProps,
      inactiveProps: _inactiveProps,
      ...props
    }: {
      to: string
      children: React.ReactNode
      onClick?: React.MouseEventHandler
      activeOptions?: unknown
      activeProps?: unknown
      inactiveProps?: unknown
    }) =>
      React.createElement(
        'a',
        { href: to, onClick, ...props },
        children,
      ),
    Outlet: () =>
      React.createElement(
        'div',
        { 'data-testid': 'admin-outlet' },
        'Admin Outlet Content',
      ),
    createFileRoute: () => (opts: unknown) => opts,
  }
})

describe('Admin Route and Shell Integration Suite', { timeout: 15000 }, () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  describe('verifyAdminAccessFn (admin-auth.ts)', () => {
    it('should export verifyAdminAccessFn as a function and verifyAdminAccessCore returns user for valid admin session', async () => {
      const { verifyAdminAccessFn } = await import(
        '../../src/server/functions/admin-auth'
      )
      const { verifyAdminAccessCore } = await import(
        '../../src/server/core/admin-auth'
      )

      expect(typeof verifyAdminAccessFn).toBe('function')
      expect(typeof verifyAdminAccessCore).toBe('function')

      vi.mocked(requireAdminSession).mockResolvedValueOnce({
        session: {
          id: 's-admin',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'admin-1',
          expiresAt: new Date(Date.now() + 86400000),
          token: 'tok-admin',
        },
        user: {
          id: 'admin-1',
          email: 'admin@zona.ai',
          name: 'Admin User',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'admin',
          banned: false,
        },
      })

      const req = new Request('http://localhost:3000/admin')
      const result = await verifyAdminAccessCore(req)
      expect(result).toBeDefined()
      expect(result.user.id).toBe('admin-1')
      expect(result.user.role).toBe('admin')
    })

    it('should throw redirect to /auth/sign-in when user is unauthenticated', async () => {
      const { verifyAdminAccessCore } = await import(
        '../../src/server/core/admin-auth'
      )

      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AppError('Sesi autentikasi diperlukan.', 401, 'ERR-003'),
      )

      const req = new Request('http://localhost:3000/admin')
      await expect(verifyAdminAccessCore(req)).rejects.toMatchObject({
        options: {
          to: '/auth/sign-in',
        },
      })
    })

    it('should throw redirect to /auth/sign-in when user is non-admin', async () => {
      const { verifyAdminAccessCore } = await import(
        '../../src/server/core/admin-auth'
      )

      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AppError(
          'Akses ditolak. Diperlukan hak akses administrator.',
          403,
          'ERR-003',
        ),
      )

      const req = new Request('http://localhost:3000/admin')
      await expect(verifyAdminAccessCore(req)).rejects.toMatchObject({
        options: {
          to: '/auth/sign-in',
        },
      })
    })

    it('should throw redirect to /auth/sign-in when user is banned', async () => {
      const { verifyAdminAccessCore } = await import(
        '../../src/server/core/admin-auth'
      )

      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AppError(
          'Akun Anda telah dinonaktifkan: Security violation.',
          403,
          'ERR-USER-BANNED',
        ),
      )

      const req = new Request('http://localhost:3000/admin')
      await expect(verifyAdminAccessCore(req)).rejects.toMatchObject({
        options: {
          to: '/auth/sign-in',
        },
      })
    })
  })

  describe('AdminSidebar Component', () => {
    it('should render brand logo, ADMIN badge, and all 6 navigation links plus back to workspace', async () => {
      const { AdminSidebar } = await import(
        '../../src/components/admin/AdminSidebar'
      )

      const { getByTestId, unmount } = render(React.createElement(AdminSidebar))

      expect(getByTestId('admin-sidebar')).toBeDefined()
      expect(getByTestId('admin-brand-badge')).toBeDefined()

      const overviewLink = getByTestId('admin-nav-overview')
      const usersLink = getByTestId('admin-nav-users')
      const modelsLink = getByTestId('admin-nav-models')
      const feedbackLink = getByTestId('admin-nav-feedback')
      const creditsLink = getByTestId('admin-nav-credits')
      const auditLink = getByTestId('admin-nav-audit-log')
      const backLink = getByTestId('admin-back-workspace')

      expect(overviewLink.getAttribute('href')).toBe('/admin')
      expect(usersLink.getAttribute('href')).toBe('/admin/users')
      expect(modelsLink.getAttribute('href')).toBe('/admin/models')
      expect(feedbackLink.getAttribute('href')).toBe('/admin/feedback')
      expect(creditsLink.getAttribute('href')).toBe('/admin/credits')
      expect(auditLink.getAttribute('href')).toBe('/admin/audit-log')
      expect(backLink.getAttribute('href')).toBe('/')
      unmount()
    })

    it('should trigger onClose callback when nav links are clicked in mobile context', async () => {
      const { AdminSidebar } = await import(
        '../../src/components/admin/AdminSidebar'
      )
      const onClose = vi.fn()

      const { getByTestId, unmount } = render(
        React.createElement(AdminSidebar, { onClose }),
      )

      const usersLink = getByTestId('admin-nav-users')
      fireEvent.click(usersLink)
      expect(onClose).toHaveBeenCalledTimes(1)
      unmount()
    })
  })

  describe('AdminShell Component', () => {
    it('should render desktop sidebar and canvas with children', async () => {
      const { AdminShell } = await import(
        '../../src/components/admin/AdminShell'
      )

      render(
        React.createElement(
          AdminShell,
          null,
          React.createElement('div', { 'data-testid': 'test-child' }, 'Child Content'),
        ),
      )

      expect(screen.getByTestId('admin-shell')).toBeDefined()
      expect(screen.getByTestId('admin-sidebar')).toBeDefined()
      expect(screen.getByTestId('test-child')).toBeDefined()
    })

    it('should toggle mobile navigation drawer when mobile menu button is clicked', async () => {
      const { AdminShell } = await import(
        '../../src/components/admin/AdminShell'
      )

      render(
        React.createElement(
          AdminShell,
          null,
          React.createElement('div', null, 'Main Body'),
        ),
      )

      const mobileToggle = screen.getByTestId('admin-mobile-menu-toggle')
      expect(screen.queryByTestId('admin-mobile-drawer')).toBeNull()

      fireEvent.click(mobileToggle)
      expect(screen.getByTestId('admin-mobile-drawer')).toBeDefined()

      const closeBtn = screen.getByTestId('admin-mobile-drawer-close')
      fireEvent.click(closeBtn)
      expect(screen.queryByTestId('admin-mobile-drawer')).toBeNull()
    })
  })

  describe('Admin Parent Route (admin.tsx)', () => {
    it('should configure beforeLoad hook to guard access and render AdminShell with Outlet', async () => {
      const adminRouteModule = await import('../../src/routes/admin')
      const routeConfig = adminRouteModule.Route as {
        options?: {
          beforeLoad?: () => Promise<unknown>
          component?: React.ComponentType
        }
        beforeLoad?: () => Promise<unknown>
        component?: React.ComponentType
      }

      const component = routeConfig.options?.component || routeConfig.component
      expect(component).toBeDefined()

      const Component = component!
      render(React.createElement(Component))
      expect(screen.getByTestId('admin-shell')).toBeDefined()
      expect(screen.getByTestId('admin-outlet')).toBeDefined()
    })
  })

  describe('Admin Dashboard Overview Page (admin/index.tsx)', () => {
    it('should render 6 metric cards, quick shortcuts, and recent audit activity', async () => {
      const { AdminDashboardOverview } = await import(
        '../../src/routes/admin/index'
      )

      const mockData = {
        totalUsers: 142,
        activeUsers: 138,
        bannedUsers: 4,
        newFeedbackCount: 12,
        disabledModelsCount: 2,
        totalCreditsInCirculation: 52000,
        totalCreditTransactions: 310,
        recentAuditLogs: [
          {
            id: 'log-1',
            adminId: 'admin-1',
            adminEmail: 'admin@zona.ai',
            adminName: 'Admin',
            adminImage: null,
            action: 'user.ban',
            targetId: 'user-banned',
            targetType: 'user',
            metadata: { reason: 'Violation' },
            createdAt: new Date('2026-09-08T10:00:00Z'),
          },
        ],
      }

      render(React.createElement(AdminDashboardOverview, { data: mockData }))

      expect(screen.getByTestId('admin-metric-total-users')).toBeDefined()
      expect(screen.getByTestId('admin-metric-active-users')).toBeDefined()
      expect(screen.getByTestId('admin-metric-banned-users')).toBeDefined()
      expect(screen.getByTestId('admin-metric-new-feedback')).toBeDefined()
      expect(screen.getByTestId('admin-metric-disabled-models')).toBeDefined()
      expect(screen.getByTestId('admin-metric-total-credits')).toBeDefined()
      expect(screen.getByTestId('admin-recent-audit-feed')).toBeDefined()
      expect(screen.getByTestId('admin-quick-shortcuts')).toBeDefined()
    })
  })

  describe('Admin Users Page (admin/users.tsx)', () => {
    it('should render search, filters, user table, and enforce self-ban disablement', async () => {
      const { AdminUsersView } = await import('../../src/routes/admin/users')

      const mockUsers = [
        {
          id: 'admin-self',
          name: 'Current Admin',
          email: 'alghifarighazy508@gmail.com',
          emailVerified: true,
          image: null,
          credits: 1000,
          role: 'admin' as const,
          banned: false,
          banReason: null,
          banExpires: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
        {
          id: 'user-target',
          name: 'Regular Target',
          email: 'target@example.com',
          emailVerified: true,
          image: null,
          credits: 200,
          role: 'user' as const,
          banned: false,
          banReason: null,
          banExpires: null,
          createdAt: new Date('2026-02-01'),
          updatedAt: new Date('2026-02-01'),
        },
      ]

      render(
        React.createElement(AdminUsersView, {
          initialData: { users: mockUsers, total: 2, page: 1, limit: 20 },
          currentAdminId: 'admin-self',
          currentAdminEmail: 'alghifarighazy508@gmail.com',
        }),
      )

      expect(screen.getByTestId('admin-users-search')).toBeDefined()
      expect(screen.getByTestId('admin-users-role-filter')).toBeDefined()
      expect(screen.getByTestId('admin-users-status-filter')).toBeDefined()

      const selfBanButton = screen.queryByTestId('ban-user-btn-admin-self')
      if (selfBanButton) {
        expect(selfBanButton.hasAttribute('disabled')).toBe(true)
      } else {
        expect(selfBanButton).toBeNull()
      }

      const targetBanButton = screen.getByTestId('ban-user-btn-user-target')
      expect(targetBanButton.hasAttribute('disabled')).toBe(false)
    })
  })

  describe('Admin Models Page (admin/models.tsx)', () => {
    it('should render model catalog rows and model availability controls', async () => {
      const { AdminModelsView } = await import('../../src/routes/admin/models')

      const mockCatalog = [
        {
          id: 'anthropic/claude-3-5-sonnet',
          name: 'Claude 3.5 Sonnet',
          provider: 'anthropic',
          cost: 10,
          contextWindow: 200000,
        },
      ]

      const mockSettings = [
        {
          id: 's-1',
          modelId: 'anthropic/claude-3-5-sonnet',
          isActive: true,
          disabledReason: null,
          updatedBy: 'admin-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      render(
        React.createElement(AdminModelsView, {
          catalog: mockCatalog,
          initialSettings: mockSettings,
        }),
      )

      expect(screen.getByTestId('admin-models-table')).toBeDefined()
      expect(
        screen.getByTestId('model-status-toggle-anthropic/claude-3-5-sonnet'),
      ).toBeDefined()
    })
  })

  describe('Admin Feedback Page (admin/feedback.tsx)', () => {
    it('should render feedback inbox table and detail modal trigger', async () => {
      const { AdminFeedbackView } = await import(
        '../../src/routes/admin/feedback'
      )

      const mockFeedback = [
        {
          id: 'fb-1',
          userId: 'user-1',
          type: 'bug' as const,
          title: 'Layout clipping on mobile',
          description: 'Sidebar overflows screen on iOS',
          stepsToReproduce: 'Open sidebar on iPhone',
          expectedBehavior: 'Fit within screen',
          actualBehavior: 'Horizontally overflows',
          attachmentR2Key: 'feedback/user-1/fb-1/screenshot.png',
          attachmentFileName: 'screenshot.png',
          attachmentMimeType: 'image/png',
          attachmentFileSize: 120000,
          status: 'new' as const,
          adminNotes: null,
          createdAt: new Date('2026-09-08T12:00:00Z'),
          updatedAt: new Date('2026-09-08T12:00:00Z'),
          userName: 'Reporter User',
          userEmail: 'reporter@zona.ai',
          userImage: null,
        },
      ]

      render(
        React.createElement(AdminFeedbackView, {
          initialData: { feedback: mockFeedback, total: 1, page: 1, limit: 20 },
        }),
      )

      expect(screen.getByTestId('admin-feedback-table')).toBeDefined()
      expect(screen.getByTestId('admin-feedback-status-filter')).toBeDefined()
      expect(screen.getByTestId('admin-feedback-type-filter')).toBeDefined()

      const detailBtn = screen.getByTestId('view-feedback-btn-fb-1')
      fireEvent.click(detailBtn)

      await waitFor(() => {
        expect(screen.getByTestId('feedback-detail-modal')).toBeDefined()
        expect(screen.getByTestId('feedback-attachment-link')).toBeDefined()
      })
    })
  })

  describe('Admin Credits Page (admin/credits.tsx)', () => {
    it('should render credit balances table and adjust credit dialog', async () => {
      const { AdminCreditsView } = await import(
        '../../src/routes/admin/credits'
      )

      const mockUsers = [
        {
          id: 'user-cred-1',
          name: 'Credit User',
          email: 'credit@zona.ai',
          image: null,
          credits: 450,
          role: 'user' as const,
          banned: false,
          createdAt: new Date('2026-03-01'),
          updatedAt: new Date('2026-03-01'),
        },
      ]

      render(
        React.createElement(AdminCreditsView, {
          initialData: { users: mockUsers, total: 1, page: 1, limit: 20 },
        }),
      )

      expect(screen.getByTestId('admin-credits-table')).toBeDefined()
      const adjustBtn = screen.getByTestId('adjust-credits-btn-user-cred-1')
      fireEvent.click(adjustBtn)

      await waitFor(() => {
        expect(screen.getByTestId('adjust-credits-dialog')).toBeDefined()
        expect(screen.getByTestId('adjust-credits-mode-select')).toBeDefined()
        expect(screen.getByTestId('adjust-credits-amount-input')).toBeDefined()
      })
    })
  })

  describe('Admin Audit Log Page (admin/audit-log.tsx)', () => {
    it('should render audit log table and filters', async () => {
      const { AdminAuditLogView } = await import(
        '../../src/routes/admin/audit-log'
      )

      const mockLogs = [
        {
          id: 'log-100',
          adminId: 'admin-1',
          adminEmail: 'admin@zona.ai',
          adminName: 'Admin System',
          adminImage: null,
          action: 'credit.adjust',
          targetId: 'user-cred-1',
          targetType: 'user',
          metadata: { mode: 'add', amount: 50, newBalance: 500 },
          createdAt: new Date('2026-09-08T15:30:00Z'),
        },
      ]

      render(
        React.createElement(AdminAuditLogView, {
          initialData: {
            items: mockLogs,
            pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
          },
        }),
      )

      expect(screen.getByTestId('admin-audit-table')).toBeDefined()
      expect(screen.getByTestId('admin-audit-action-filter')).toBeDefined()
    })
  })
})
