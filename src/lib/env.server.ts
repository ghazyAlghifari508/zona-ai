import { z } from 'zod'

if (typeof window !== 'undefined') {
  throw new Error('env.server.ts is server-only — do not import on the client')
}

export const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .url()
    .refine((v) => v.startsWith('postgresql://'), {
      message: 'DATABASE_URL must start with postgresql://',
    }),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z
    .string()
    .min(1)
    .refine((v) => v.includes('.apps.googleusercontent.com'), {
      message: 'GOOGLE_CLIENT_ID must contain .apps.googleusercontent.com',
    }),
  GOOGLE_CLIENT_SECRET: z
    .string()
    .min(10, 'GOOGLE_CLIENT_SECRET must be at least 10 characters'),
  NINE_ROUTER_BASE_URL: z
    .string()
    .url()
    .refine((v) => v.endsWith('/v1'), {
      message: 'NINE_ROUTER_BASE_URL must end with /v1',
    }),
  NINE_ROUTER_API_KEY: z.string().min(1, 'NINE_ROUTER_API_KEY is required'),
  R2_ACCOUNT_ID: z.string().min(1, 'R2_ACCOUNT_ID is required'),
  R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID is required'),
  R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY is required'),
  R2_BUCKET_NAME: z.string().min(1, 'R2_BUCKET_NAME is required'),
  R2_PUBLIC_URL: z.string().url().optional(),
  TAVILY_API_KEY: z
    .string()
    .startsWith('tvly-', 'TAVILY_API_KEY must start with tvly-'),
  MIDTRANS_SERVER_KEY: z.string().min(1, 'MIDTRANS_SERVER_KEY is required'),
  MIDTRANS_CLIENT_KEY: z.string().min(1, 'MIDTRANS_CLIENT_KEY is required'),
  MIDTRANS_IS_PRODUCTION: z.enum(['true', 'false']).default('false'),
  EXA_API_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z
    .string()
    .url()
    .optional()
    .default('https://cloud.langfuse.com'),
  APP_URL: z.string().url(),
  ADMIN_EMAILS: z.string().default('alghifarighazy508@gmail.com'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
})

export const env = envSchema.parse(process.env)

export type Env = z.infer<typeof envSchema>
