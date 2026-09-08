# ZonaAI Admin System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a robust, secure, server-verified Admin System for ZonaAI with role authorization, model availability management, user management & ban enforcement, feedback system with Cloudflare R2 attachments, credit management, audit logging, and a Notion-style Admin Dashboard.

**Architecture:** Extend PostgreSQL `users` table with `role` and `banned` columns, introduce `model_settings`, `feedback`, and `audit_logs` Drizzle tables, implement server-side security guards (`requireAdminSession`, `checkUserNotBanned`), integrate dynamic model overrides into the central model registry and chat/compare boundaries, and provide modular sub-routes under `/admin` with unified navigation.

**Tech Stack:** Bun, TanStack Start, TanStack Router, Drizzle ORM (PostgreSQL), Better Auth, React 19, Tailwind CSS v4, Lucide/Hugeicons, Cloudflare R2 (S3 Client), Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-09-admin-system-design.md`](file:///C:/Coding/Web%20Development/Tanstack-start/zona-ai/docs/superpowers/specs/2026-09-09-admin-system-design.md)

## Global Constraints
- Zero type bypasses: `as never`, `as any`, `as unknown as SomeType`, `@ts-ignore` are strictly forbidden in `src/`.
- MindMarket / Notion-style aesthetic: paper canvas (`#f6f5f4`), white cards (`#ffffff`), hairline borders (`rgba(0,0,0,0.08)`), zero heavy shadows (`shadow-lg`, `shadow-xl`), zero emojis in UI chrome.
- Server-side authorization only: no relying on client state or hidden buttons for security.
- Bootstrap email: `alghifarighazy508@gmail.com` maps to role `'admin'`.
- Self-protection: Admin cannot ban their own account or `alghifarighazy508@gmail.com`.
- Conventional commits format for every task commit.

---

### Task 1: Schema Migrations & Better Auth Configuration

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/auth/auth.ts`
- Test: `tests/integration/admin-schema.test.ts`

**Interfaces:**
- Consumes: Existing Drizzle setup in `src/lib/db/schema.ts`
- Produces: `modelSettings`, `feedback`, `auditLogs` tables, extended `users` columns (`role`, `banned`, `banReason`, `banExpires`).

- [ ] **Step 1: Write the failing test for schema definition**

```typescript
// tests/integration/admin-schema.test.ts
import { describe, expect, it } from 'vitest'
import { auditLogs, feedback, modelSettings, users } from '../../src/lib/db/schema'

describe('Admin Schema Definitions', () => {
  it('should export users table with role and banned columns', () => {
    expect(users.role).toBeDefined()
    expect(users.banned).toBeDefined()
    expect(users.banReason).toBeDefined()
    expect(users.banExpires).toBeDefined()
  })

  it('should export modelSettings table with required fields', () => {
    expect(modelSettings.modelId).toBeDefined()
    expect(modelSettings.isActive).toBeDefined()
    expect(modelSettings.disabledReason).toBeDefined()
    expect(modelSettings.updatedBy).toBeDefined()
  })

  it('should export feedback table with required fields', () => {
    expect(feedback.id).toBeDefined()
    expect(feedback.userId).toBeDefined()
    expect(feedback.type).toBeDefined()
    expect(feedback.title).toBeDefined()
    expect(feedback.description).toBeDefined()
    expect(feedback.status).toBeDefined()
  })

  it('should export auditLogs table with required fields', () => {
    expect(auditLogs.id).toBeDefined()
    expect(auditLogs.adminId).toBeDefined()
    expect(auditLogs.adminEmail).toBeDefined()
    expect(auditLogs.action).toBeDefined()
    expect(auditLogs.targetId).toBeDefined()
    expect(auditLogs.targetType).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/admin-schema.test.ts`
Expected: FAIL with `users.role is undefined`

- [ ] **Step 3: Update schema.ts and auth.ts**

In `src/lib/db/schema.ts`:
Add to `users`:
```typescript
role: text('role').notNull().default('user'),
banned: boolean('banned').notNull().default(false),
banReason: text('ban_reason'),
banExpires: timestamp('ban_expires', { withTimezone: true }),
```
Export `modelSettings`, `feedback`, `auditLogs` tables as specified in design doc.
In `src/lib/auth/auth.ts`:
Add `additionalFields` to `user` options in `betterAuth(...)`.

- [ ] **Step 4: Generate migration and run test to verify it passes**

Run: `bun x vitest run tests/integration/admin-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/auth/auth.ts tests/integration/admin-schema.test.ts
git commit -m "feat(db): add admin role, banned status, modelSettings, feedback, and auditLogs tables"
```

---

### Task 2: Server-Side Authorization & Security Guards

**Files:**
- Create: `src/lib/auth/admin-guard.ts`
- Modify: `src/lib/auth/session.ts`
- Modify: `src/lib/env.server.ts`
- Test: `tests/integration/admin-guard.test.ts`

**Interfaces:**
- Consumes: `getAuthSession` from `src/lib/auth/session.ts`, `db` from `src/lib/db/index.ts`
- Produces: `requireAdminSession(request: Request)`, `checkUserNotBanned(user: ...)`, `preventAdminSelfBan(...)`

- [ ] **Step 1: Write the failing test for security guards**

```typescript
// tests/integration/admin-guard.test.ts
import { describe, expect, it } from 'vitest'
import { checkUserNotBanned, preventAdminSelfBan, requireAdminSession } from '../../src/lib/auth/admin-guard'
import { AppError } from '../../src/lib/utils/errors'

describe('Admin & Ban Guards', () => {
  it('should throw 403 ERR-USER-BANNED when user is banned', () => {
    expect(() =>
      checkUserNotBanned({ banned: true, banReason: 'Spam activity' }),
    ).toThrowError(AppError)

    try {
      checkUserNotBanned({ banned: true, banReason: 'Violation' })
    } catch (e) {
      const err = e as AppError
      expect(err.status).toBe(403)
      expect(err.code).toBe('ERR-USER-BANNED')
    }
  })

  it('should pass when user is not banned', () => {
    expect(() => checkUserNotBanned({ banned: false })).not.toThrow()
  })

  it('should prevent admin from banning self or primary admin email', () => {
    expect(() =>
      preventAdminSelfBan('admin-1', 'admin-1', 'admin@zona.ai'),
    ).toThrowError('Admin utama tidak dapat menonaktifkan akun sendiri.')

    expect(() =>
      preventAdminSelfBan('admin-1', 'user-2', 'alghifarighazy508@gmail.com'),
    ).toThrowError('Admin utama tidak dapat menonaktifkan akun sendiri.')

    expect(() =>
      preventAdminSelfBan('admin-1', 'user-2', 'regular@example.com'),
    ).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/admin-guard.test.ts`
Expected: FAIL with module `admin-guard` not found

- [ ] **Step 3: Implement admin-guard.ts and update session.ts**

Create `src/lib/auth/admin-guard.ts`:
- Implement `checkUserNotBanned`
- Implement `preventAdminSelfBan`
- Implement `requireAdminSession`
Update `src/lib/env.server.ts` to parse `ADMIN_EMAILS` (default `"alghifarighazy508@gmail.com"`).
Update `src/lib/auth/session.ts` to sync user role to `'admin'` if `user.email` matches `ADMIN_EMAILS`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/admin-guard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/admin-guard.ts src/lib/auth/session.ts src/lib/env.server.ts tests/integration/admin-guard.test.ts
git commit -m "feat(auth): add requireAdminSession, checkUserNotBanned, and admin bootstrap sync"
```

---

### Task 3: AI Model Availability Management & Runtime Enforcement

**Files:**
- Create: `src/server/core/admin-models.ts`
- Create: `src/server/functions/admin-models.ts`
- Modify: `src/lib/models/registry.ts`
- Modify: `src/lib/models/router.ts`
- Modify: `src/server/core/chat.ts`
- Modify: `src/server/core/compare.ts`
- Test: `tests/integration/admin-models.test.ts`

**Interfaces:**
- Consumes: `modelSettings` from `src/lib/db/schema.ts`, `requireAdminSession` from `src/lib/auth/admin-guard.ts`
- Produces: `getModelOverridesMap()`, `updateModelAvailabilityCore()`, `updateModelAvailabilityFn()`

- [ ] **Step 1: Write the failing test for model overrides and chat enforcement**

```typescript
// tests/integration/admin-models.test.ts
import { describe, expect, it } from 'vitest'
import { isModelAvailable, updateModelOverrideInMemory } from '../../src/server/core/admin-models'

describe('Admin Model Availability Enforcement', () => {
  it('should report model as active by default', () => {
    expect(isModelAvailable('cx/gpt-5.6-terra')).toBe(true)
  })

  it('should report model as inactive after being disabled', () => {
    updateModelOverrideInMemory('cx/gpt-5.6-terra', false, 'Maintenance')
    expect(isModelAvailable('cx/gpt-5.6-terra')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/admin-models.test.ts`
Expected: FAIL with module not found

- [ ] **Step 3: Implement admin-models core & functions, and wire into chat & compare**

1. Create `src/server/core/admin-models.ts` with cached overrides map, DB upsert to `model_settings`, audit log insert (`model.enable` / `model.disable`).
2. Create `src/server/functions/admin-models.ts` with `getModelSettingsFn` and `updateModelAvailabilityFn`.
3. In `src/server/core/chat.ts`: check `isModelAvailable(modelId)`. If disabled, throw `AppError('Model ini sedang dinonaktifkan oleh administrator.', 400, 'ERR-MODEL-DISABLED')`.
4. In `src/server/core/compare.ts`: check all models in `modelIds`. If any disabled, reject before credit deduction.
5. In `src/lib/models/router.ts`: update `resolveAutoModel` to pick an active model.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/admin-models.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/core/admin-models.ts src/server/functions/admin-models.ts src/server/core/chat.ts src/server/core/compare.ts src/lib/models/registry.ts src/lib/models/router.ts tests/integration/admin-models.test.ts
git commit -m "feat(models): implement model availability overrides and hard backend enforcement"
```

---

### Task 4: User Management, Ban Enforcement & Self-Ban Guard

**Files:**
- Create: `src/server/core/admin-users.ts`
- Create: `src/server/functions/admin-users.ts`
- Modify: `src/server/core/chat.ts`
- Modify: `src/server/core/compare.ts`
- Modify: `src/server/functions/files.ts`
- Modify: `src/server/functions/search.ts`
- Test: `tests/integration/admin-users.test.ts`

**Interfaces:**
- Consumes: `users`, `auditLogs` from schema, `requireAdminSession`, `checkUserNotBanned`, `preventAdminSelfBan`
- Produces: `listUsersCore()`, `banUserCore()`, `unbanUserCore()`, `listUsersFn`, `banUserFn`, `unbanUserFn`

- [ ] **Step 1: Write the failing test for user management & ban operations**

```typescript
// tests/integration/admin-users.test.ts
import { describe, expect, it } from 'vitest'
import { banUserCore, unbanUserCore } from '../../src/server/core/admin-users'

describe('Admin User Management Core', () => {
  it('should export banUserCore and unbanUserCore functions', () => {
    expect(typeof banUserCore).toBe('function')
    expect(typeof unbanUserCore).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/admin-users.test.ts`
Expected: FAIL with module not found

- [ ] **Step 3: Implement admin-users core and functions, and apply ban enforcement**

1. Create `src/server/core/admin-users.ts`:
   - `listUsersCore`: select users with search by name/email, role filter, status filter, pagination.
   - `banUserCore`: verifies admin, prevents self-ban, updates `users.banned = true`, records `auditLogs` (`user.ban`).
   - `unbanUserCore`: verifies admin, updates `users.banned = false`, records `auditLogs` (`user.unban`).
2. Create `src/server/functions/admin-users.ts`.
3. In `src/server/core/chat.ts`, `src/server/core/compare.ts`, `src/server/functions/files.ts`, `src/server/functions/search.ts`:
   Add `checkUserNotBanned(session.user)` right after `getAuthSession(request)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/admin-users.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/core/admin-users.ts src/server/functions/admin-users.ts src/server/core/chat.ts src/server/core/compare.ts src/server/functions/files.ts src/server/functions/search.ts tests/integration/admin-users.test.ts
git commit -m "feat(admin): implement user management, ban/unban mutations, and API-wide ban guards"
```

---

### Task 5: Credit Management & Admin-Only Reset 100 Kredit

**Files:**
- Modify: `src/server/core/credits.ts`
- Modify: `src/server/functions/credits.ts`
- Modify: `src/components/layout/CreditWidget.tsx`
- Test: `tests/integration/admin-credits.test.ts`

**Interfaces:**
- Consumes: `requireAdminSession` from `src/lib/auth/admin-guard.ts`, `users`, `creditTransactions`, `auditLogs`
- Produces: `adjustUserCreditsCore()`, `adjustUserCreditsFn()`, protected `resetDevCreditsCore()`

- [ ] **Step 1: Write the failing test for credit admin protections**

```typescript
// tests/integration/admin-credits.test.ts
import { describe, expect, it } from 'vitest'
import { resetDevCreditsCore } from '../../src/server/core/credits'
import { AppError } from '../../src/lib/utils/errors'

describe('Admin Credit Guard', () => {
  it('should reject non-admin request with 403 on resetDevCreditsCore', async () => {
    // Mock regular user request
    const fakeRequest = new Request('http://localhost:3000/api/credits/reset', {
      headers: { 'x-test-role': 'user' },
    })
    await expect(resetDevCreditsCore({ request: fakeRequest })).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/admin-credits.test.ts`
Expected: FAIL or passes incorrectly without admin verification

- [ ] **Step 3: Update credits.ts and CreditWidget.tsx**

1. In `src/server/core/credits.ts`:
   - Update `resetDevCreditsCore`: call `await requireAdminSession(request)`. Non-admin caller throws 403 Forbidden.
   - Implement `adjustUserCreditsCore({ request, data: { userId, amount, mode, reason } })`:
     Calculates new balance (`add`, `deduct`, `set`), updates `users.credits`, inserts `creditTransactions`, inserts `auditLogs` (`credit.adjust`).
2. In `src/server/functions/credits.ts`: export `adjustUserCreditsFn`.
3. In `src/components/layout/CreditWidget.tsx`: only render Reset button if `user?.role === 'admin'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/admin-credits.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/core/credits.ts src/server/functions/credits.ts src/components/layout/CreditWidget.tsx tests/integration/admin-credits.test.ts
git commit -m "feat(credits): enforce admin-only reset credits and add manual credit adjustment core"
```

---

### Task 6: Feedback System Backend, User Feedback Page & Help Card

**Files:**
- Create: `src/server/core/feedback.ts`
- Create: `src/server/functions/feedback.ts`
- Create: `src/routes/api/feedback/upload.tsx`
- Create: `src/routes/feedback.tsx`
- Modify: `src/components/pricing/HelpSection.tsx`
- Test: `tests/integration/feedback.test.ts`

**Interfaces:**
- Consumes: `feedback` table, `getAuthSession`, `requireAdminSession`, `putObject` from R2 client
- Produces: `submitFeedbackFn`, `listFeedbackFn`, `updateFeedbackStatusFn`, `/feedback` user route

- [ ] **Step 1: Write the failing test for feedback core**

```typescript
// tests/integration/feedback.test.ts
import { describe, expect, it } from 'vitest'
import { submitFeedbackCore, updateFeedbackStatusCore } from '../../src/server/core/feedback'

describe('Feedback System Core', () => {
  it('should export submitFeedbackCore and updateFeedbackStatusCore', () => {
    expect(typeof submitFeedbackCore).toBe('function')
    expect(typeof updateFeedbackStatusCore).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/feedback.test.ts`
Expected: FAIL with module not found

- [ ] **Step 3: Implement feedback core, server functions, and pages**

1. Create `src/server/core/feedback.ts`:
   - `submitFeedbackCore`: validates form inputs, saves to `feedback` with status `'new'`.
   - `listFeedbackCore`: admin-only, filters by status and type.
   - `updateFeedbackStatusCore`: admin-only, updates status, records `auditLogs` (`feedback.status_update`).
2. Create `src/server/functions/feedback.ts`.
3. Create `src/routes/api/feedback/upload.tsx` for R2 screenshot upload with magic byte and MIME validation.
4. Create `src/routes/feedback.tsx`:
   - Dedicated page with types (`general`, `feature`, `bug`), conditional bug reproduction fields, optional R2 attachment, and clear success state.
5. In `src/components/pricing/HelpSection.tsx`: add 4th card "Kirim Feedback" pointing to `/feedback`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/feedback.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/core/feedback.ts src/server/functions/feedback.ts src/routes/api/feedback/upload.tsx src/routes/feedback.tsx src/components/pricing/HelpSection.tsx tests/integration/feedback.test.ts
git commit -m "feat(feedback): implement feedback submission, R2 attachment upload, and Bantuan card"
```

---

### Task 7: Audit Log Core & Admin Metrics

**Files:**
- Create: `src/server/core/admin-audit.ts`
- Create: `src/server/functions/admin-audit.ts`
- Create: `src/server/core/admin-dashboard.ts`
- Create: `src/server/functions/admin-dashboard.ts`
- Test: `tests/integration/admin-dashboard.test.ts`

**Interfaces:**
- Consumes: `auditLogs`, `users`, `feedback`, `modelSettings`, `creditTransactions`
- Produces: `getAdminDashboardMetricsCore()`, `listAuditLogsCore()`

- [ ] **Step 1: Write the failing test for dashboard metrics and audit logs**

```typescript
// tests/integration/admin-dashboard.test.ts
import { describe, expect, it } from 'vitest'
import { getAdminDashboardMetricsCore } from '../../src/server/core/admin-dashboard'
import { listAuditLogsCore } from '../../src/server/core/admin-audit'

describe('Admin Dashboard Metrics & Audit Logs', () => {
  it('should export getAdminDashboardMetricsCore and listAuditLogsCore', () => {
    expect(typeof getAdminDashboardMetricsCore).toBe('function')
    expect(typeof listAuditLogsCore).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/admin-dashboard.test.ts`
Expected: FAIL with module not found

- [ ] **Step 3: Implement admin-audit and admin-dashboard core & functions**

1. Create `src/server/core/admin-audit.ts`:
   - `listAuditLogsCore`: admin-only, returns paginated audit log entries with admin email, action, target, metadata.
2. Create `src/server/core/admin-dashboard.ts`:
   - `getAdminDashboardMetricsCore`: admin-only, calculates total users, active users, banned users, new feedback count, active vs disabled models count, total credit in circulation, total credit transactions, and 10 recent audit entries.
3. Create corresponding functions in `src/server/functions/`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/admin-dashboard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/core/admin-audit.ts src/server/functions/admin-audit.ts src/server/core/admin-dashboard.ts src/server/functions/admin-dashboard.ts tests/integration/admin-dashboard.test.ts
git commit -m "feat(admin): implement audit log query service and dashboard overview metrics"
```

---

### Task 8: Banned User Landing Page & Profile Dropdown Navigation

**Files:**
- Create: `src/routes/banned.tsx`
- Modify: `src/components/layout/ProfileMenu.tsx`
- Test: `tests/unit/admin-navigation.test.tsx`

**Interfaces:**
- Consumes: `user` prop from `ProfileMenu.tsx`
- Produces: "Admin" dropdown item in ProfileMenu, `/banned` route

- [ ] **Step 1: Write the failing test for ProfileMenu and Banned route**

```typescript
// tests/unit/admin-navigation.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProfileMenu } from '../../src/components/layout/ProfileMenu'

describe('ProfileMenu Admin Navlink', () => {
  it('should not show Admin link for regular user', () => {
    render(<ProfileMenu user={{ name: 'Regular User', email: 'user@example.com', role: 'user' }} />)
    expect(screen.queryByText('Admin')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `bun x vitest run tests/unit/admin-navigation.test.tsx`

- [ ] **Step 3: Implement Banned page and ProfileMenu link**

1. In `src/components/layout/ProfileMenu.tsx`:
   - Update `Props` type to include `role?: string | null`.
   - Add `<DropdownMenuItem asChild>` with `<Link to="/admin">Admin</Link>` positioned strictly below `Pengaturan`.
   - Conditionally render only if `user?.role === 'admin'`.
2. Create `src/routes/banned.tsx`:
   - Clean card explaining account suspension with support contact link.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/admin-navigation.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/ProfileMenu.tsx src/routes/banned.tsx tests/unit/admin-navigation.test.tsx
git commit -m "feat(ui): add admin navlink to ProfileMenu and create banned account landing page"
```

---

### Task 9: Admin Shell Layout & Admin Dashboard Pages

**Files:**
- Create: `src/components/admin/AdminSidebar.tsx`
- Create: `src/components/admin/AdminShell.tsx`
- Create: `src/routes/admin.tsx`
- Create: `src/routes/admin/index.tsx`
- Create: `src/routes/admin/users.tsx`
- Create: `src/routes/admin/models.tsx`
- Create: `src/routes/admin/feedback.tsx`
- Create: `src/routes/admin/credits.tsx`
- Create: `src/routes/admin/audit-log.tsx`
- Test: `tests/integration/admin-routes.test.ts`

**Interfaces:**
- Consumes: `verifyAdminAccessFn`, admin server functions from Tasks 3–7
- Produces: Complete `/admin/*` interface

- [ ] **Step 1: Write the failing test for admin route protection**

```typescript
// tests/integration/admin-routes.test.ts
import { describe, expect, it } from 'vitest'
import { verifyAdminAccessCore } from '../../src/server/core/admin-guard'

describe('Admin Route Access Verification', () => {
  it('should export verifyAdminAccessCore', () => {
    expect(typeof verifyAdminAccessCore).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/integration/admin-routes.test.ts`
Expected: FAIL with function not found

- [ ] **Step 3: Implement AdminShell, AdminSidebar, and all admin sub-routes**

1. Create `src/components/admin/AdminSidebar.tsx`:
   - Width 260px, Notion style, links to: Dashboard, Users, AI Models, Feedback, Credits, Audit Log.
   - Return to Workspace button.
2. Create `src/components/admin/AdminShell.tsx`:
   - Sidebar + main paper canvas layout, responsive mobile drawer.
3. Create `src/routes/admin.tsx`:
   - Parent layout route with `beforeLoad: async () => verifyAdminAccessFn()`.
   - Renders `<AdminShell><Outlet /></AdminShell>`.
4. Create `src/routes/admin/index.tsx`: 6 metric cards + recent audit activity feed.
5. Create `src/routes/admin/users.tsx`: Searchable user table, role/status filters, ban/unban modal.
6. Create `src/routes/admin/models.tsx`: Model table with toggle switch & maintenance reason dialog.
7. Create `src/routes/admin/feedback.tsx`: Feedback inbox, filter by type/status, detail modal, status changer.
8. Create `src/routes/admin/credits.tsx`: Credit balances, adjust/set credit dialog.
9. Create `src/routes/admin/audit-log.tsx`: Chronological audit log trail.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/integration/admin-routes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/ src/routes/admin.tsx src/routes/admin/ tests/integration/admin-routes.test.ts
git commit -m "feat(admin): build admin shell layout and modular sub-routes for all modules"
```

---

### Task 10: Model Picker & Compare Grid Disabled State Integration

**Files:**
- Modify: `src/components/chat/useModelCatalog.ts`
- Modify: `src/components/chat/ModelSelector.tsx`
- Modify: `src/components/chat/CompareGrid.tsx`
- Test: `tests/unit/admin-model-picker.test.tsx`

**Interfaces:**
- Consumes: dynamic `isActive` and `disabledReason` from catalog entries
- Produces: disabled styling and "Sedang tidak tersedia" indicator in model pickers

- [ ] **Step 1: Write the failing test for model picker disabled state**

```typescript
// tests/unit/admin-model-picker.test.tsx
import { describe, expect, it } from 'vitest'
import type { ModelCatalogEntry } from '../../src/lib/models/types'

describe('Model Catalog Dynamic Availability', () => {
  it('should support isActive and disabledReason in ModelCatalogEntry type', () => {
    const entry: Partial<ModelCatalogEntry> = {
      id: 'cx/gpt-5.6-terra',
      isActive: false,
      disabledReason: 'Maintenance',
    }
    expect(entry.isActive).toBe(false)
    expect(entry.disabledReason).toBe('Maintenance')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun x vitest run tests/unit/admin-model-picker.test.tsx`
Expected: FAIL with `isActive does not exist on ModelCatalogEntry`

- [ ] **Step 3: Update types and components**

1. In `src/lib/models/types.ts`: add `isActive?: boolean` and `disabledReason?: string | null` to `ModelCatalogEntry`.
2. In `src/components/chat/useModelCatalog.ts`: merge dynamic overrides.
3. In `src/components/chat/ModelSelector.tsx`:
   - If `model.isActive === false`: render item with disabled state, display "Sedang tidak tersedia" tag with tooltip of `disabledReason`. Prevent selection.
4. In `src/components/chat/CompareGrid.tsx`: disable adding or running nonactive models.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun x vitest run tests/unit/admin-model-picker.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/models/types.ts src/components/chat/useModelCatalog.ts src/components/chat/ModelSelector.tsx src/components/chat/CompareGrid.tsx tests/unit/admin-model-picker.test.tsx
git commit -m "feat(ui): display disabled model status and prevent selection in model pickers"
```

---

### Task 11: End-to-End Verification & Quality Gates

**Files:**
- Test: All affected test suites
- Check: Typecheck, lint, bypass scan

**Interfaces:**
- Consumes: Complete codebase
- Produces: Verified 0 errors build

- [ ] **Step 1: Run TypeScript typecheck**

Run: `bun x tsc --noEmit`
Expected: 0 errors

- [ ] **Step 2: Run Biome check**

Run: `bun x biome check ./src`
Expected: 0 errors / clean

- [ ] **Step 3: Run bypass scan for forbidden casts**

Run: `git grep -E "as never|as any|as unknown as" src/ | grep -v "routeTree.gen.ts" || true`
Expected: 0 matches in business logic

- [ ] **Step 4: Run full Vitest suite**

Run: `bun x vitest run`
Expected: All unit & integration tests PASS

- [ ] **Step 5: Final commit if any tweaks made**

```bash
git commit -m "test(admin): verify full admin system integration and pass quality gates"
```
