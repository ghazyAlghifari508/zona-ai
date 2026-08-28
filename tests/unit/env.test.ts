/**
 * @vitest-environment node
 */
import { beforeAll, describe, expect, it } from 'vitest'

const validEnv = {
  DATABASE_URL: 'postgresql://zona:password@localhost:5432/zona_ai',
  BETTER_AUTH_SECRET: 'your-secret-key-min-32-chars-here-change-me-12345',
  BETTER_AUTH_URL: 'http://localhost:3000',
  GOOGLE_CLIENT_ID: 'your-google-client-id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'GOCSPX-your-google-client-secret',
  NINE_ROUTER_BASE_URL: 'http://localhost:20128/v1',
  NINE_ROUTER_API_KEY: 'your-9router-api-key',
  R2_ACCOUNT_ID: 'your-cloudflare-account-id',
  R2_ACCESS_KEY_ID: 'your-r2-access-key-id',
  R2_SECRET_ACCESS_KEY: 'your-r2-secret-access-key',
  R2_BUCKET_NAME: 'zona-ai-files',
  R2_PUBLIC_URL: 'https://files.zona.ai',
  TAVILY_API_KEY: 'tvly-your-tavily-api-key',
  EXA_API_KEY: 'your-exa-api-key',
  LANGFUSE_SECRET_KEY: 'sk-lf-54a28432-e48b-4894-b65f-434e56814601',
  LANGFUSE_PUBLIC_KEY: 'pk-lf-95079f67-d33f-4fd1-84e4-fda78fc88c77',
  LANGFUSE_BASE_URL: 'https://cloud.langfuse.com',
  APP_URL: 'http://localhost:3000',
  NODE_ENV: 'test' as const,
}

// Ensure process.env has valid values before importing server-only module
// (fail-fast parse runs on import)
for (const [k, v] of Object.entries(validEnv)) {
  if (process.env[k] === undefined) {
    process.env[k] = v as string
  }
}

// Dynamic import after env is primed — avoids hoist-order fail-fast
const { envSchema, env } = await import('../../src/lib/env.server')

describe('env.server', () => {
  it('parses valid env without throwing', () => {
    expect(() => envSchema.parse(validEnv)).not.toThrow()
  })

  it('exports parsed env matching valid values', () => {
    // env is parsed from process.env (which we primed above)
    expect(env.DATABASE_URL).toBeDefined()
    expect(env.DATABASE_URL.startsWith('postgresql://')).toBe(true)
  })

  it('rejects missing DATABASE_URL', () => {
    const { DATABASE_URL: _omit, ...rest } = validEnv
    expect(() => envSchema.parse(rest)).toThrow()
  })

  it('rejects DATABASE_URL without postgresql:// prefix', () => {
    expect(() => envSchema.parse({ ...validEnv, DATABASE_URL: 'http://localhost/db' })).toThrow()
    expect(() => envSchema.parse({ ...validEnv, DATABASE_URL: 'mysql://user@host/db' })).toThrow()
  })

  it('rejects DATABASE_URL that is not a URL', () => {
    expect(() => envSchema.parse({ ...validEnv, DATABASE_URL: 'not-a-url' })).toThrow()
  })

  it('rejects BETTER_AUTH_SECRET <32 chars', () => {
    expect(() => envSchema.parse({ ...validEnv, BETTER_AUTH_SECRET: 'short' })).toThrow()
    expect(() => envSchema.parse({ ...validEnv, BETTER_AUTH_SECRET: '1234567890123456789012345678901' })).toThrow() // 31
  })

  it('accepts BETTER_AUTH_SECRET exactly 32', () => {
    expect(() => envSchema.parse({ ...validEnv, BETTER_AUTH_SECRET: 'a'.repeat(32) })).not.toThrow()
  })

  it('rejects invalid BETTER_AUTH_URL', () => {
    expect(() => envSchema.parse({ ...validEnv, BETTER_AUTH_URL: 'not-a-url' })).toThrow()
  })

  it('rejects GOOGLE_CLIENT_ID without .apps.googleusercontent.com', () => {
    expect(() => envSchema.parse({ ...validEnv, GOOGLE_CLIENT_ID: 'invalid-client-id' })).toThrow()
    expect(() => envSchema.parse({ ...validEnv, GOOGLE_CLIENT_ID: '123.apps.other.com' })).toThrow()
  })

  it('accepts valid GOOGLE_CLIENT_ID', () => {
    expect(() => envSchema.parse(validEnv)).not.toThrow()
  })

  it('rejects GOOGLE_CLIENT_SECRET <10 chars', () => {
    expect(() => envSchema.parse({ ...validEnv, GOOGLE_CLIENT_SECRET: 'short' })).toThrow()
  })

  it('rejects NINE_ROUTER_BASE_URL without /v1 suffix', () => {
    expect(() => envSchema.parse({ ...validEnv, NINE_ROUTER_BASE_URL: 'http://localhost:20128' })).toThrow()
    expect(() => envSchema.parse({ ...validEnv, NINE_ROUTER_BASE_URL: 'http://localhost:20128/v2' })).toThrow()
  })

  it('rejects NINE_ROUTER_BASE_URL that is not a URL', () => {
    expect(() => envSchema.parse({ ...validEnv, NINE_ROUTER_BASE_URL: 'not-a-url' })).toThrow()
  })

  it('rejects missing NINE_ROUTER_API_KEY', () => {
    expect(() => envSchema.parse({ ...validEnv, NINE_ROUTER_API_KEY: '' })).toThrow()
  })

  it('rejects missing R2 vars', () => {
    expect(() => envSchema.parse({ ...validEnv, R2_ACCOUNT_ID: '' })).toThrow()
    expect(() => envSchema.parse({ ...validEnv, R2_ACCESS_KEY_ID: '' })).toThrow()
    expect(() => envSchema.parse({ ...validEnv, R2_SECRET_ACCESS_KEY: '' })).toThrow()
    expect(() => envSchema.parse({ ...validEnv, R2_BUCKET_NAME: '' })).toThrow()
  })

  it('accepts missing R2_PUBLIC_URL (optional)', () => {
    const { R2_PUBLIC_URL: _omit, ...rest } = validEnv
    expect(() => envSchema.parse(rest)).not.toThrow()
  })

  it('rejects invalid R2_PUBLIC_URL', () => {
    expect(() => envSchema.parse({ ...validEnv, R2_PUBLIC_URL: 'not-a-url' })).toThrow()
  })

  it('rejects TAVILY_API_KEY without tvly- prefix', () => {
    expect(() => envSchema.parse({ ...validEnv, TAVILY_API_KEY: 'invalid-key' })).toThrow()
    expect(() => envSchema.parse({ ...validEnv, TAVILY_API_KEY: 'sk-123' })).toThrow()
  })

  it('accepts valid TAVILY_API_KEY', () => {
    expect(() => envSchema.parse({ ...validEnv, TAVILY_API_KEY: 'tvly-abc123' })).not.toThrow()
  })

  it('accepts missing EXA_API_KEY (optional 19th var)', () => {
    const { EXA_API_KEY: _omit, ...rest } = validEnv
    expect(() => envSchema.parse(rest)).not.toThrow()
  })

  it('accepts missing LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY (optional)', () => {
    const { LANGFUSE_SECRET_KEY: _a, LANGFUSE_PUBLIC_KEY: _b, ...rest } = validEnv
    expect(() => envSchema.parse(rest)).not.toThrow()
  })

  it('accepts missing LANGFUSE_BASE_URL and defaults to cloud.langfuse.com', () => {
    const { LANGFUSE_BASE_URL: _omit, ...rest } = validEnv
    const parsed = envSchema.parse(rest)
    expect(parsed.LANGFUSE_BASE_URL).toBe('https://cloud.langfuse.com')
  })

  it('rejects invalid LANGFUSE_BASE_URL', () => {
    expect(() => envSchema.parse({ ...validEnv, LANGFUSE_BASE_URL: 'not-a-url' })).toThrow()
  })

  it('accepts missing APP_URL as required', () => {
    const { APP_URL: _omit, ...rest } = validEnv
    expect(() => envSchema.parse(rest)).toThrow()
  })

  it('rejects invalid APP_URL', () => {
    expect(() => envSchema.parse({ ...validEnv, APP_URL: 'not-a-url' })).toThrow()
  })

  it('defaults NODE_ENV to development when missing', () => {
    const { NODE_ENV: _omit, ...rest } = validEnv
    const parsed = envSchema.parse(rest)
    expect(parsed.NODE_ENV).toBe('development')
  })

  it('rejects invalid NODE_ENV', () => {
    expect(() => envSchema.parse({ ...validEnv, NODE_ENV: 'staging' as never })).toThrow()
  })
})
