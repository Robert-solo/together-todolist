import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Mounts the SQLite-backed API on both `vite dev` and `vite preview`. */
function zhiriApi() {
  const attach = async (server) => {
    const { handleApi } = await server.ssrLoadModule('/server/api.js')
    const { handleAuthApi, handleAdminApi, handleUpload } = await server.ssrLoadModule('/server/auth.js')
    server.middlewares.use((req, res, next) => {
      if (!req.url) return next()
      const url = new URL(req.url, 'http://localhost')

      if (url.pathname.startsWith('/uploads/')) return handleUpload(req, res, url)

      if (url.pathname.startsWith('/api/auth/')) {
        return handleAuthApi(req, res, url).catch((err) => {
          console.error('[zhiri auth]', err)
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'internal error' }))
          }
        })
      }

      if (url.pathname.startsWith('/api/admin/')) {
        return handleAdminApi(req, res, url).catch((err) => {
          console.error('[zhiri admin]', err)
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'internal error' }))
          }
        })
      }

      if (url.pathname.startsWith('/api/')) {
        return handleApi(req, res, url).catch((err) => {
          console.error('[zhiri api]', err)
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'internal error' }))
          }
        })
      }

      next()
    })
  }
  return {
    name: 'zhiri-api',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}

export default defineConfig({
  plugins: [react(), zhiriApi()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['todo.whunlp.asia'],
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: ['todo.whunlp.asia'],
  },
})
