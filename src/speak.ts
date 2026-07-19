/** 汉字朗读：本地代理百度女声（更慢），失败时有道单字兜底 */

let currentAudio: HTMLAudioElement | null = null
let currentObjectUrl: string | null = null
let speakGeneration = 0

function revokeObjectUrl() {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = null
  }
}

export function stopSpeaking() {
  speakGeneration += 1
  if (currentAudio) {
    currentAudio.onerror = null
    currentAudio.onended = null
    currentAudio.pause()
    currentAudio.removeAttribute('src')
    currentAudio.load()
    currentAudio = null
  }
  revokeObjectUrl()
}

function playBlob(blob: Blob, rate: number, generation: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (generation !== speakGeneration) {
      resolve(false)
      return
    }

    revokeObjectUrl()
    const objectUrl = URL.createObjectURL(blob)
    currentObjectUrl = objectUrl

    const audio = new Audio(objectUrl)
    audio.playbackRate = rate
    currentAudio = audio

    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null
      revokeObjectUrl()
      resolve(true)
    }
    audio.onerror = () => {
      if (currentAudio === audio) currentAudio = null
      revokeObjectUrl()
      resolve(false)
    }

    void audio.play().then(
      () => {
        /* wait for onended */
      },
      () => {
        if (currentAudio === audio) currentAudio = null
        revokeObjectUrl()
        resolve(false)
      },
    )
  })
}

async function playViaProxy(text: string, generation: number): Promise<boolean> {
  try {
    const url = `/api/tts?text=${encodeURIComponent(text)}&spd=2`
    const res = await fetch(url)
    if (!res.ok) return false
    const blob = await res.blob()
    if (blob.size < 200) return false
    const type = blob.type || ''
    if (type.includes('json') || type.includes('html')) return false
    return playBlob(blob, 1, generation)
  } catch {
    return false
  }
}

function youdaoUrl(char: string): string {
  return `https://dict.youdao.com/dictvoice?le=zh&audio=${encodeURIComponent(char)}`
}

function playAudioSrc(src: string, rate: number, generation: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (generation !== speakGeneration) {
      resolve(false)
      return
    }

    const audio = new Audio(src)
    audio.playbackRate = rate
    currentAudio = audio

    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null
      resolve(true)
    }
    audio.onerror = () => {
      if (currentAudio === audio) currentAudio = null
      resolve(false)
    }

    void audio.play().then(
      () => {
        /* wait for onended */
      },
      () => {
        if (currentAudio === audio) currentAudio = null
        resolve(false)
      },
    )
  })
}

async function playViaYoudaoChars(text: string, generation: number): Promise<boolean> {
  const chars = [...text].filter((ch) => /[\u4e00-\u9fff]/.test(ch))
  if (chars.length === 0) return false

  for (const char of chars) {
    if (generation !== speakGeneration) return false
    // 0.75 更慢女声
    const ok = await playAudioSrc(youdaoUrl(char), 0.75, generation)
    if (!ok) return false
  }
  return true
}

export async function speakText(text: string): Promise<void> {
  const cleaned = text.replace(/\s+/g, '').trim()
  if (!cleaned) return

  stopSpeaking()
  const generation = speakGeneration

  const ok = await playViaProxy(cleaned, generation)
  if (ok || generation !== speakGeneration) return

  await playViaYoudaoChars(cleaned, generation)
}
