import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'fs'
import { execSync } from 'child_process'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

function readEnvironmentValue(name: string): string | undefined {
  const value: string | undefined = process.env[name]?.trim()
  return value ? value : undefined
}

function readGitOutput(command: string, fallback: string): string {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || fallback
  } catch {
    return fallback
  }
}

const appVersion = readEnvironmentValue('VITE_APP_VERSION') ?? pkg.version
const commitHash = readEnvironmentValue('VITE_COMMIT_HASH') ?? readGitOutput('git rev-parse --short HEAD', 'dev')
const commitMessage = readEnvironmentValue('VITE_COMMIT_MESSAGE') ?? readGitOutput('git log -1 --format=%s', 'unknown')
const buildTime = readEnvironmentValue('VITE_BUILD_TIME') ?? new Date().toISOString()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __COMMIT_HASH__: JSON.stringify(commitHash),
    __COMMIT_MESSAGE__: JSON.stringify(commitMessage),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
