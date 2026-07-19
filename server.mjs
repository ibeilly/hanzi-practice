import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, 'dist')
const port = Number(process.env.PORT || 8080)
const host = process.env.HOST || '0.0.0.0'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

async function handleTts(req, res) {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    const text = (url.searchParams.get('text') || '').trim()
    const spd = Math.min(9, Math.max(1, Number(url.searchParams.get('spd') || 2) || 2))

    if (!text || text.length > 40) {
      res.writeHead(400)
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
      res.writeHead(upstream.status)
      res.end('tts upstream error')
      return
    }

    const buf = Buffer.from(await upstream.arrayBuffer())
    if (buf.byteLength < 200) {
      res.writeHead(502)
      res.end('empty audio')
      return
    }

    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'public, max-age=86400',
      'Content-Length': buf.byteLength,
    })
    res.end(buf)
  } catch {
    res.writeHead(502)
    res.end('tts failed')
  }
}

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0] || '/')
  const rel = decoded === '/' ? '/index.html' : decoded
  const full = path.normalize(path.join(root, rel))
  if (!full.startsWith(root)) return null
  return full
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404)
      res.end('Not Found')
      return
    }
    const ext = path.extname(filePath).toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=604800',
    })
    res.end(data)
  })
}

const server = http.createServer((req, res) => {
  const url = req.url || '/'

  if (url.startsWith('/api/tts')) {
    void handleTts(req, res)
    return
  }

  let filePath = safeJoin(distDir, url)
  if (!filePath) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html')
    }
    fs.stat(filePath, (err2) => {
      if (err2) {
        // SPA fallback
        sendFile(res, path.join(distDir, 'index.html'))
        return
      }
      sendFile(res, filePath)
    })
  })
})

server.listen(port, host, () => {
  console.log(`hanzi-practice listening on http://${host}:${port}`)
})
