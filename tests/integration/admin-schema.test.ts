import { describe, expect, it } from 'vitest'
import {
  auditLogs,
  feedback,
  modelSettings,
  users,
} from '../../src/lib/db/schema'

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
