/**
 * Client-safe server function RPC wrappers.
 * Core implementations live in src/server/core/ (server-only).
 */
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import {
  createConversationSchema,
  deleteConversationSchema,
  getConversationSchema,
  getConversationsSchema,
  updateConversationSchema,
} from '../../lib/utils/validation'
import {
  createConversationCore,
  deleteConversationCore,
  getConversationCore,
  getConversationsCore,
  updateConversationCore,
} from '../core/conversations'

export const getConversations = createServerFn({ method: 'GET' })
  .validator((data: unknown) => getConversationsSchema.parse(data))
  .handler(({ data }) =>
    getConversationsCore({ data, request: getRequest() as Request }),
  )

export const getConversation = createServerFn({ method: 'GET' })
  .validator((data: unknown) => getConversationSchema.parse(data))
  .handler(({ data }) =>
    getConversationCore({ data, request: getRequest() as Request }),
  )

export const createConversation = createServerFn({ method: 'POST' })
  .validator((data: unknown) => createConversationSchema.parse(data))
  .handler(({ data }) =>
    createConversationCore({ data, request: getRequest() as Request }),
  )

export const updateConversation = createServerFn({ method: 'POST' })
  .validator((data: unknown) => updateConversationSchema.parse(data))
  .handler(({ data }) =>
    updateConversationCore({ data, request: getRequest() as Request }),
  )

export const deleteConversation = createServerFn({ method: 'POST' })
  .validator((data: unknown) => deleteConversationSchema.parse(data))
  .handler(({ data }) =>
    deleteConversationCore({ data, request: getRequest() as Request }),
  )
