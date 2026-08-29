/**
 * Client-safe server function RPC wrappers.
 * Core implementations live in src/server/core/ (server-only).
 */
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getMessagesCore } from '../core/messages'

const getMessagesSchema = z.object({ conversationId: z.string().uuid() })

import { z } from 'zod'

export const getMessages = createServerFn({ method: 'GET' })
  .validator((data: unknown) => getMessagesSchema.parse(data))
  .handler(({ data }) =>
    getMessagesCore({ data, request: getRequest() as Request }),
  )
