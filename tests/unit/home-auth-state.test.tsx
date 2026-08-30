import { describe, expect, it } from 'vitest'

describe('Home auth status resolution logic', () => {
  type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

  function resolveAuthStatus(
    serverSession: { user?: unknown } | null | undefined,
    clientSession: { user?: unknown } | null | undefined,
    isPending: boolean,
  ): AuthStatus {
    const activeSession = clientSession ?? serverSession ?? null
    if (activeSession?.user) {
      return 'authenticated'
    }
    if (serverSession === null || (!isPending && !clientSession?.user)) {
      return 'unauthenticated'
    }
    return 'loading'
  }

  it('resolves directly to authenticated when serverSession has user (instant SSR, zero flicker)', () => {
    // Before client finishes pending fetch, serverSession is present
    const status = resolveAuthStatus(
      { user: { id: 'user-1', name: 'Alghi' } },
      null, // client store not yet hydrated
      true, // client is pending
    )
    expect(status).toBe('authenticated')
  })

  it('resolves directly to unauthenticated when serverSession is confirmed null', () => {
    const status = resolveAuthStatus(
      null, // server confirmed no session cookie
      null,
      true,
    )
    expect(status).toBe('unauthenticated')
  })

  it('resolves to loading and NEVER unauthenticated if serverSession is unknown and client is pending', () => {
    const status = resolveAuthStatus(
      undefined, // unknown / client-only transition
      null,
      true, // pending
    )
    expect(status).toBe('loading')
  })

  it('resolves to unauthenticated after client fetch completes with no user', () => {
    const status = resolveAuthStatus(
      undefined,
      null,
      false, // fetch finished
    )
    expect(status).toBe('unauthenticated')
  })

  it('resolves to authenticated when client session resolves user', () => {
    const status = resolveAuthStatus(
      null, // e.g. after fresh login
      { user: { id: 'user-2' } },
      false,
    )
    expect(status).toBe('authenticated')
  })
})
