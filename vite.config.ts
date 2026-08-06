import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

// https://vitejs.dev/config/
export default defineConfig({
  // Expose GHOSTFOLIO_* env vars to the client in addition to VITE_*.
  // Vite only injects prefixed vars into import.meta.env, so without this
  // GHOSTFOLIO_URL in .env is invisible to src/lib/config.ts and the app
  // silently falls back to same-origin /api/v1 (the dev proxy → :3333).
  envPrefix: ['VITE_', 'GHOSTFOLIO_'],
  plugins: [
    react(),
    {
      name: 'sidecar-config',
      // Dev-server middleware that reads/writes the sidecar's own config.json.
      // The frontend is a static bundle with no backend of its own, so we use
      // a tiny same-origin endpoint to persist bucket configuration. This runs
      // only in `vite dev`; in production the static host (nginx/Caddy) would
      // provide an equivalent endpoint or the file is shipped alongside.
      configureServer(server) {
        const configPath = path.resolve(__dirname, 'config.json');
        server.middlewares.use('/sidecar/config', async (req, res) => {
          // GET → return the current config.json
          if (req.method === 'GET') {
            try {
              const data = await fs.promises.readFile(configPath, 'utf8');
              res.setHeader('Content-Type', 'application/json');
              res.end(data);
            } catch (e) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'config.json not found' }));
            }
            return;
          }

          // PUT → overwrite config.json with the request body
          if (req.method === 'PUT') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(chunk as Buffer);
            }
            const body = Buffer.concat(chunks).toString('utf8');
            // Validate JSON before persisting.
            try {
              JSON.parse(body);
            } catch {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'invalid JSON' }));
              return;
            }
            try {
              await fs.promises.writeFile(configPath, body, 'utf8');
              res.setHeader('Content-Type', 'application/json');
              res.end(body);
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'failed to write config' }));
            }
            return;
          }

          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'method not allowed' }));
        });
      }
    }
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    // Proxy the Ghostfolio API to the running instance. Same-origin avoids
    // CORS and lets the Authorization header pass straight through.
    proxy: {
      '/api': {
        target: 'http://localhost:3333',
        changeOrigin: true
      }
    }
  }
});
