import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

function serveSimulatorOutput() {
  return {
    name: 'serve-simulator-output',
    configureServer(server: { middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/output/')) return next()
        const filePath = path.join(__dirname, 'simulador', 'output', req.url.replace('/output', ''))
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return next()
        res.setHeader('Content-Type', 'application/json')
        res.end(fs.readFileSync(filePath, 'utf-8'))
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), serveSimulatorOutput()],
  server: {
    proxy: {
      /** Servidor local extracción / lectura JSON (ej. npm run server:truckflow) */
      '/api/truckflow': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        timeout: 600_000,
        proxyTimeout: 600_000,
        configure(proxy) {
          proxy.on('error', (err, _req, res: any) => {
            console.error('[vite proxy /api/truckflow]', err.message)
            if (res && typeof res.writeHead === 'function' && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' })
              res.end(
                JSON.stringify({
                  error:
                    'Servidor local Truckflow no disponible en 8787. En otra terminal: npm run server:truckflow',
                  detail: err.message,
                })
              )
            }
          })
        },
      },
      /** Evita CORS en desarrollo hacia journey-event/list */
      '/journey-api': {
        target: 'http://138.36.237.33:8090',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/journey-api/, ''),
      },
    },
  },
})
