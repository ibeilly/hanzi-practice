import { defineConfig, type PreviewServer, type ViteDevServer } from 'vite'

async function handleTts(
  req: { url?: string },
  res: {
    statusCode: number
    setHeader: (k: string, v: string) => void
    end: (body?: string | Buffer) => void
  },
) {
  try {
    const raw = req.url || '/'
    const url = new URL(raw, 'http://127.0.0.1')
    const text = (url.searchParams.get('text') || '').trim()
    const spd = Math.min(9, Math.max(1, Number(url.searchParams.get('spd') || 2) || 2))

    if (!text || text.length > 40) {
      res.statusCode = 400
      res.end('bad text')
      return
    }

    const tts = `https://fanyi.baidu.com/gettts?lan=zh&text=${encodeURIComponent(text)}&spd=${spd}&source=web`
    const upstream = await fetch(tts, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8',
      },
    })

    if (!upstream.ok) {
      res.statusCode = upstream.status
      res.end('tts upstream error')
      return
    }

    const buf = Buffer.from(await upstream.arrayBuffer())
    if (buf.byteLength < 200) {
      res.statusCode = 502
      res.end('empty audio')
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.end(buf)
  } catch {
    res.statusCode = 502
    res.end('tts failed')
  }
}

function ttsPlugin() {
  const attach = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api/tts')) {
        next()
        return
      }
      void handleTts(req, res)
    })
  }

  return {
    name: 'hanzi-tts-proxy',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}

export default defineConfig({
  // GitHub Pages 项目站使用 /<repo>/；Docker / 本地默认为 /
  base: process.env.VITE_BASE || '/',
  plugins: [ttsPlugin()],
})
