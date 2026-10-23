import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from './i18n'
import './index.css'
import { initTheme } from './lib/theme'
import { QueryRetryPolicy } from './lib/queryRetryPolicy'
import App from './App.tsx'

initTheme()

if (typeof document !== 'undefined') {
  document.title = i18n.t('appName')
  i18n.on('languageChanged', () => {
    document.title = i18n.t('appName')
  })
}

declare global {
  interface Window {
    __queryClient?: QueryClient
  }
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (failureCount: number, error: unknown): boolean => QueryRetryPolicy.shouldRetry(failureCount, error) } },
})

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__queryClient = queryClient
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
