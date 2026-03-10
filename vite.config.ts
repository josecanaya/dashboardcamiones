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
})
