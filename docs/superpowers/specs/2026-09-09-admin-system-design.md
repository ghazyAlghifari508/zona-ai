# ZonaAI Admin System — Design Specification

## Overview & Background

ZonaAI is a restrained, high-performance multi-model AI workspace. Authentication is handled via Better Auth with Google OAuth. To enable administrative control, this specification defines the complete **Admin System**:
- Database-backed roles (`user` vs `admin`) and ban enforcement
- Centralized server-side authorization guards (`requireAdminSession`, `checkUserNotBanned`)
- Model availability management (persisted overrides for `is_active` and maintenance notes)
- Feedback system (dedicated `/feedback` page with Cloudflare R2 file attachments and admin inbox)
- Credit management and admin-only "Reset 100 Kredit" action
- Comprehensive audit logging for all sensitive administrative actions
- Modular `/admin` dashboard with dedicated sub-routes and Notion-style UI

---

## 1. Role & Authorization Architecture

### 1.1 Source of Truth
- Primary source of truth: PostgreSQL `users` table via Drizzle ORM (`role` column).
- Secondary bootstrap mapping: Server-only environment variable `ADMIN_EMAILS=alghifarighazy508@gmail.com`.
- Hardcoded rule: On session creation/validation (`getAuthSession`), if `user.email` matches `ADMIN_EMAILS` and `user.role !== 'admin'`, the database is automatically updated to `role = 'admin'`.

### 1.2 Database Schema Extensions (`src/lib/db/schema.ts`)
```typescript
// Additions to existing users table
role: text('role').notNull().default('user'),
banned: boolean('banned').notNull().default(false),
banReason: text('ban_reason'),
banExpires: timestamp('ban_expires', { withTimezone: true }),
```
Indexes:
- `index('users_role_idx').on(table.role)`
- `index('users_banned_idx').on(table.banned)`

### 1.3 Better Auth Schema Synchronization (`src/lib/auth/auth.ts`)
Better Auth config adds `additionalFields`:
```typescript
user: {
  additionalFields: {
    role: { type: 'string', defaultValue: 'user', input: false },
    banned: { type: 'boolean', defaultValue: false, input: false },
    banReason: { type: 'string', required: false, input: false },
    banExpires: { type: 'date', required: false, input: false },
  },
},
```

### 1.4 Security Guards (`src/lib/auth/admin-guard.ts`)
- `checkUserNotBanned(user: { banned?: boolean | null; banReason?: string | null })`:
  Throws `AppError('Akun Anda telah dinonaktifkan.', 403, 'ERR-USER-BANNED')` if `user.banned === true`.
- `requireAdminSession(request: Request)`:
  1. Calls `getAuthSession(request)`.
  2. Runs `checkUserNotBanned(session.user)`.
  3. Validates `session.user.role === 'admin'`.
  4. Throws `AppError('Akses ditolak. Diperlukan hak akses administrator.', 403, 'ERR-003')` if not an admin.
- `preventAdminSelfBan(currentAdminId: string, targetUserId: string, targetEmail: string)`:
  Throws `AppError('Admin utama tidak dapat menonaktifkan akun sendiri.', 400, 'ERR-004')` if `currentAdminId === targetUserId` or `targetEmail === 'alghifarighazy508@gmail.com'`.

### 1.5 Enforcement Points
- Chat & Compare: `sendMessageCore`, `sendCompareMessageCore` run `checkUserNotBanned`.
- Storage: `uploadFileCore`, `deleteAttachmentCore` run `checkUserNotBanned`.
- Web Search: `searchWebCore` runs `checkUserNotBanned`.
- Credits: `resetDevCreditsCore` runs `requireAdminSession`. Returns 403 for non-admins.
- Route beforeLoad: Authenticated routes check ban status; if banned, redirect to `/banned`.

---

## 2. Navigation & Routing

### 2.1 Profile Dropdown (`src/components/layout/ProfileMenu.tsx`)
Menu order:
1. Pengaturan (`/settings`)
2. **Admin** (`/admin`) — Rendered **only if** `user?.role === 'admin'`
3. Tampilan (Theme Toggle)
4. Keluar (Sign Out)

### 2.2 Route Structure
```text
/admin                   -> Admin Overview Dashboard
/admin/users             -> User Management & Ban Controls
/admin/models            -> AI Model Availability & Maintenance Notes
/admin/feedback          -> Feedback Inbox & Status Management
/admin/credits           -> User Credit Balances & Adjustments
/admin/audit-log         -> Chronological Audit Trail
/feedback                -> Dedicated User Feedback Submission Page
/banned                  -> Suspended Account Landing Page
```

### 2.3 Route Protection
- Parent route `/admin` defines `beforeLoad`:
  ```typescript
  beforeLoad: async () => {
    const session = await verifyAdminAccessFn()
    return { session }
  }
  ```
  If unauthenticated -> redirect to `/auth/sign-in`.
  If non-admin -> redirect to `/` (403 Forbidden).
  If banned -> redirect to `/banned`.

---

## 3. AI Model Availability Management

### 3.1 Database Schema (`src/lib/db/schema.ts`)
```typescript
export const modelSettings = pgTable('model_settings', {
  modelId: text('model_id').primaryKey(),
  isActive: boolean('is_active').notNull().default(true),
  disabledReason: text('disabled_reason'),
  updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})
```

### 3.2 Service Layer & In-Memory Cache (`src/server/core/admin-models.ts`)
- In-memory cache with fast invalidation on mutations:
  ```typescript
  export async function getModelOverridesMap(): Promise<Map<string, { isActive: boolean; disabledReason: string | null }>>
  export async function updateModelAvailabilityCore(params: { modelId: string; isActive: boolean; disabledReason?: string; request: Request })
  ```
- Logs action to `audit_logs`: `'model.enable'` or `'model.disable'`.

### 3.3 Runtime Enforcement
- `getModelCatalog()` in `src/lib/models/registry.ts`:
  Merges dynamic `isActive` and `disabledReason` flags onto each catalog entry.
- `ModelSelector.tsx` & `CompareGrid.tsx`:
  Disabled models remain visible for transparency, but are rendered in a disabled state (`opacity-50 pointer-events-none`) with a tooltip/badge: *"Sedang tidak tersedia"* (plus maintenance reason).
- `src/server/core/chat.ts` & `src/server/core/compare.ts`:
  Reject generation requests with status 400 `ERR-MODEL-DISABLED` if any requested model has `isActive === false`. No credits deducted.
- `resolveAutoModel()`:
  Filters out disabled models when choosing an optimal fallback.

---

## 4. Feedback System

### 4.1 Entry Point on Bantuan Page (`src/components/pricing/HelpSection.tsx`)
Card added to `/bantuan`:
- Title: *"Kirim Feedback"*
- Description: *"Beri saran fitur, laporkan kendala, atau kirim masukan untuk Zona.ai."*
- Link: `/feedback`

### 4.2 Database Schema (`src/lib/db/schema.ts`)
```typescript
export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'general' | 'feature' | 'bug'
    title: text('title').notNull(),
    description: text('description').notNull(),
    stepsToReproduce: text('steps_to_reproduce'),
    expectedBehavior: text('expected_behavior'),
    actualBehavior: text('actual_behavior'),
    attachmentR2Key: text('attachment_r2_key'),
    attachmentFileName: text('attachment_file_name'),
    attachmentMimeType: text('attachment_mime_type'),
    attachmentFileSize: integer('attachment_file_size'),
    status: text('status').notNull().default('new'), // 'new' | 'in_progress' | 'resolved' | 'rejected'
    adminNotes: text('admin_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('feedback_user_id_idx').on(table.userId),
    index('feedback_status_idx').on(table.status),
    index('feedback_type_idx').on(table.type),
    index('feedback_created_at_idx').on(table.createdAt.desc()),
  ],
)
```

### 4.3 Dedicated Submission Route (`src/routes/feedback.tsx`)
- Types: `Feedback umum`, `Saran fitur`, `Bug / Error Report`.
- Conditional bug fields: Steps to Reproduce, Expected Behavior, Actual Behavior.
- Optional screenshot/document upload to Cloudflare R2 (`feedback/${userId}/${feedbackId}/${sanitizedFileName}`).
- Client-side and server-side Zod validation.

### 4.4 Admin Feedback Inbox (`/admin/feedback`)
- Filter by status (`all`, `new`, `in_progress`, `resolved`, `rejected`) and type (`all`, `general`, `feature`, `bug`).
- Search by title or user email.
- Detail dialog with attachment preview / safe download.
- Status updater: Mutates status and logs to `audit_logs` (`action: 'feedback.status_update'`).

---

## 5. User Management & Ban Enforcement

### 5.1 Admin Capabilities (`/admin/users`)
- Search users by name or email.
- Filter by role (`all`, `admin`, `user`) and status (`all`, `active`, `banned`).
- View credit balances and registration dates.
- Ban user action with optional `banReason`.
  - Self-ban guard: Cannot ban self or `alghifarighazy508@gmail.com`.
  - Writes to `audit_logs`: `action: 'user.ban'`.
- Unban user action:
  - Writes to `audit_logs`: `action: 'user.unban'`.

### 5.2 Banned User Experience
- Visiting the site while banned redirects to `/banned`.
- Card explains account suspension and provides support contact email.
- All API and server function calls return 403 `ERR-USER-BANNED`.

---

## 6. Credit Management & Reset Action

### 6.1 Navbar Reset 100 Kredit
- Only visible in UI if `user?.role === 'admin'`.
- `resetDevCreditsFn` server handler strictly enforces `requireAdminSession(request)`. Non-admin requests receive 403 Forbidden.

### 6.2 Admin Credit Dashboard (`/admin/credits`)
- View all user credit balances with search.
- Adjust credit dialog:
  - Add credits (`+N`)
  - Deduct credits (`-N`)
  - Set exact balance (`=N`)
- Atomically updates `users.credits`, records a `credit_transactions` entry, and writes to `audit_logs` (`action: 'credit.adjust'`).

---

## 7. Audit Log System

### 7.1 Database Schema (`src/lib/db/schema.ts`)
```typescript
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: text('admin_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    adminEmail: text('admin_email').notNull(),
    action: text('action').notNull(),
    targetId: text('target_id').notNull(),
    targetType: text('target_type').notNull(), // 'user' | 'model' | 'feedback' | 'credit'
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('audit_logs_admin_id_idx').on(table.adminId),
    index('audit_logs_action_idx').on(table.action),
    index('audit_logs_target_idx').on(table.targetType, table.targetId),
    index('audit_logs_created_at_idx').on(table.createdAt.desc()),
  ],
)
```

### 7.2 Admin View (`/admin/audit-log`)
- Chronological list of all admin actions with timestamp, admin email, action badge, target ID, and formatted metadata.

---

## 8. Admin Dashboard Overview (`/admin`)

### 8.1 Metrics Cards
1. **Total Users** (total registered accounts)
2. **Active Users vs Banned Users**
3. **New Feedback** (status === 'new')
4. **Active vs Disabled Models**
5. **Total Credits in Circulation**
6. **Total Credit Usage Transactions**

### 8.2 Activity Stream
- Displays the 10 most recent entries from `audit_logs`.

---

## 9. Design System Compliance & UX

- **Aesthetic:** MindMarket / Notion-style warm paper notebook (`#f6f5f4`), pure white cards (`#ffffff`), sidebar (`#f2f1ef` / `#ffffff`), hairline borders (`rgba(0,0,0,0.08)`).
- **Icons:** SVG from Lucide / Hugeicons with consistent stroke width. Zero emojis in UI chrome.
- **Shadows:** No heavy shadows (`shadow-lg`, `shadow-xl` strictly avoided; soft hairline borders used for structure).
- **Responsive:** Full mobile drawer navigation for admin sidebar on smaller viewports.
- **Theme:** Dark mode support using existing `useTheme()` tokens.

---

## 10. Testing & Verification Plan

1. **Unit & Integration Tests (`tests/integration/admin.test.ts`):**
   - Authorization guard: non-admin gets 403 on `requireAdminSession`.
   - Admin bootstrap: admin email is mapped to role `'admin'`.
   - Ban guard: banned user blocked with 403 on chat, compare, files, search.
   - Self-ban guard: admin cannot ban self.
   - Model availability: disabled model rejected in chat and compare; `resolveAutoModel` chooses active model.
   - Reset credits: non-admin calling `resetDevCreditsFn` gets 403.
   - Feedback submission: persists to DB with status `'new'`.
   - Audit log: records created for each admin mutation.
2. **Typecheck & Lint Verification:**
   - `bun x tsc --noEmit` -> 0 errors.
   - `bun x biome check ./src` -> passes.
   - Zero forbidden casts (`as never`, `as any`, `@ts-ignore`).
