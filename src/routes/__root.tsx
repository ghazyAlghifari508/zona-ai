import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import '../styles/app.css'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: 'utf-8' },
        { title: 'Zona.ai — Ruang kerja AI multi-model' },
        {
          name: 'description',
          content:
            'Zona.ai — workspace chat AI multi-model dengan Compare Mode, web search, dan RAG.',
        },
      ],
    }),
    component: Root,
  },
)

// Blocking theme bootstrap — keep the storage key in sync with
// src/lib/ui/theme.ts. Contains no HTML-special characters, so it is
// rendered as plain script children and still executes before first paint.
const THEME_BOOTSTRAP = `(function(){try{if(localStorage.getItem('zona-ai:theme')==='dark'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark'}}catch(e){}})()`

function Root() {
  const { queryClient } = Route.useRouteContext()
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* eslint-disable-next-line -- static string, no user content */}
        <script>{THEME_BOOTSTRAP}</script>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <Outlet />
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  )
}
