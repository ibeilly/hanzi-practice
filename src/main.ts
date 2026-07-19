import './style.css'
import HanziWriter from 'hanzi-writer'
import { pinyin } from 'pinyin-pro'
import { PRESET_TEXTS, extractHanzi } from './presets'
import { loadMoeCharTable, mountCharTable } from './charTable'
import { speakText, stopSpeaking } from './speak'

interface CharReading {
  primary: string
  full: string
  isPolyphone: boolean
}

interface CharSlot {
  char: string
  reading: CharReading
  writer: HanziWriter | null
  cell: HTMLElement
  frame: HTMLElement
  svg: SVGSVGElement
  label: HTMLSpanElement
  writerGen: number
}

const CELL_SIZE = 160
const DEFAULT_TEXT = '汉字笔顺'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <header class="site-header">
    <h1 class="brand">汉字<span>笔顺</span></h1>
    <p class="tagline">依据常用规范字形笔顺数据，支持搜索与笔顺动画演示，田字格可随时显示或隐藏。</p>
  </header>

  <main class="stage" id="stage">
    <div class="stage-meta">
      <div>
        <h2 class="stage-title" id="stage-title">笔顺演示</h2>
        <p class="stage-reading" id="stage-reading"></p>
      </div>
      <p class="stage-hint" id="stage-hint">点拼音读单字；点田字格播该字；播放则依次演示</p>
    </div>
    <div class="char-grid" id="char-grid"></div>
  </main>

  <div class="toolbar" id="toolbar">
    <div class="toolbar-group playback-controls" id="playback-controls" aria-label="播放控制">
      <button type="button" class="btn btn-accent" id="btn-play" aria-pressed="false">播放</button>
      <button type="button" class="btn btn-ghost" id="btn-speak" aria-pressed="false">读音</button>
      <button type="button" class="btn btn-ghost" id="btn-loop" aria-pressed="false">循环</button>
      <button type="button" class="btn btn-ghost" id="btn-stop" disabled>停止</button>
    </div>

    <div class="toolbar-options">
      <label class="toggle">
        <input type="checkbox" id="toggle-grid" checked />
        <span>田字格</span>
      </label>

      <label class="speed-control">
        <span>速度</span>
        <input type="range" id="speed" min="0.5" max="2.5" step="0.25" value="1" />
      </label>
    </div>
  </div>

  <section class="panel" aria-label="搜索与输入">
    <form class="search-row" id="search-form">
      <input
        id="text-input"
        type="search"
        name="q"
        maxlength="40"
        placeholder="输入汉字或词语，如：永、春天、中国"
        autocomplete="off"
        value="${DEFAULT_TEXT}"
      />
      <button class="btn btn-primary" type="submit">展示</button>
    </form>
    <div class="presets" id="presets" role="list"></div>
  </section>

  <section class="panel char-table-panel" id="char-table" aria-label="教育部汉字表快速选择"></section>

  <footer class="site-footer">
    汉字表依据教育部、国家语委《通用规范汉字表》（2013）。笔顺动画数据来自
    <a href="https://github.com/skishore/makemeahanzi" target="_blank" rel="noreferrer">Make Me a Hanzi</a>
    （经
    <a href="https://hanziwriter.org/cn/" target="_blank" rel="noreferrer">Hanzi Writer</a>
    呈现）。仅供学习使用。
  </footer>
`

const form = app.querySelector<HTMLFormElement>('#search-form')!
const input = app.querySelector<HTMLInputElement>('#text-input')!
const presetsEl = app.querySelector<HTMLDivElement>('#presets')!
const gridEl = app.querySelector<HTMLDivElement>('#char-grid')!
const stageEl = app.querySelector<HTMLElement>('#stage')!
const stageReading = app.querySelector<HTMLParagraphElement>('#stage-reading')!
const toggleGrid = app.querySelector<HTMLInputElement>('#toggle-grid')!
const speedInput = app.querySelector<HTMLInputElement>('#speed')!
const btnPlay = app.querySelector<HTMLButtonElement>('#btn-play')!
const btnSpeak = app.querySelector<HTMLButtonElement>('#btn-speak')!
const btnLoop = app.querySelector<HTMLButtonElement>('#btn-loop')!
const btnStop = app.querySelector<HTMLButtonElement>('#btn-stop')!

type PlaybackState = 'idle' | 'playing' | 'looping' | 'speaking'

let slots: CharSlot[] = []
let animToken = 0
let looping = false
let strokeSpeed = 1
let playbackState: PlaybackState = 'idle'

function setPlaybackState(next: PlaybackState) {
  playbackState = next
  updatePlaybackControls()
}

function updatePlaybackControls() {
  const hasChars = slots.length > 0
  const busy = playbackState !== 'idle'

  btnPlay.textContent = playbackState === 'playing' ? '播放中' : '播放'
  btnSpeak.textContent = playbackState === 'speaking' ? '朗读中' : '读音'
  btnLoop.textContent = playbackState === 'looping' ? '循环中' : '循环'

  btnPlay.classList.toggle('is-active', playbackState === 'playing')
  btnSpeak.classList.toggle('is-active', playbackState === 'speaking')
  btnLoop.classList.toggle('is-active', playbackState === 'looping')
  btnStop.classList.toggle('is-active', busy)

  btnPlay.setAttribute('aria-pressed', String(playbackState === 'playing'))
  btnSpeak.setAttribute('aria-pressed', String(playbackState === 'speaking'))
  btnLoop.setAttribute('aria-pressed', String(playbackState === 'looping'))

  if (!hasChars) {
    btnPlay.disabled = true
    btnSpeak.disabled = true
    btnLoop.disabled = true
    btnStop.disabled = true
    return
  }

  // 基于状态：进行中的按钮可再点取消；停止仅在非空闲可用
  btnPlay.disabled = playbackState === 'speaking' || playbackState === 'looping'
  btnSpeak.disabled = playbackState === 'playing' || playbackState === 'looping'
  btnLoop.disabled = playbackState === 'speaking' || playbackState === 'playing'
  btnStop.disabled = !busy

  // 当前激活项保持可点，用于再次点击取消
  if (playbackState === 'playing') btnPlay.disabled = false
  if (playbackState === 'speaking') btnSpeak.disabled = false
  if (playbackState === 'looping') btnLoop.disabled = false
}

function getCharReading(char: string): CharReading {
  const primary = pinyin(char, { toneType: 'symbol', type: 'array' })[0] ?? ''
  const all = pinyin(char, {
    toneType: 'symbol',
    multiple: true,
    type: 'array',
  })
  const list = (Array.isArray(all) ? all : String(all).split(' '))
    .map((item) => item.trim())
    .filter(Boolean)
  const uniques = [...new Set(list)]
  const main = primary || uniques[0] || ''
  const rest = uniques.filter((item) => item !== main)
  return {
    primary: main,
    full: rest.length ? `${main}（${rest.join(' / ')}）` : main,
    isPolyphone: rest.length > 0,
  }
}

function getTextReading(chars: string[]): string {
  return chars.map((char) => getCharReading(char).primary).join(' ')
}

function createTianzigeSvg(size: number): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('xmlns', ns)
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`)

  const grid = document.createElementNS(ns, 'g')
  grid.setAttribute('class', 'grid-lines')

  const mid = size / 2
  const lines: [number, number, number, number][] = [
    [mid, 0, mid, size],
    [0, mid, size, mid],
    [0, 0, size, size],
    [size, 0, 0, size],
  ]

  for (const [x1, y1, x2, y2] of lines) {
    const line = document.createElementNS(ns, 'line')
    line.setAttribute('x1', String(x1))
    line.setAttribute('y1', String(y1))
    line.setAttribute('x2', String(x2))
    line.setAttribute('y2', String(y2))
    line.setAttribute('stroke', '#e8a99a')
    line.setAttribute('stroke-width', '1.25')
    line.setAttribute('stroke-dasharray', '5 4')
    grid.appendChild(line)
  }

  svg.appendChild(grid)
  return svg
}

function writerOptions() {
  return {
    width: CELL_SIZE,
    height: CELL_SIZE,
    padding: 10,
    strokeColor: '#1c2b33',
    radicalColor: '#b84332',
    outlineColor: '#c5ced4',
    strokeAnimationSpeed: strokeSpeed,
    delayBetweenStrokes: Math.round(220 / strokeSpeed),
    // 始终保留灰色底稿；静止时显示底稿，动画时在底稿上描黑
    showCharacter: false,
    showOutline: true,
  }
}

function attachWriter(slot: CharSlot) {
  // 替换 SVG 节点，避免旧 Writer 异步回调往同一节点重复描边（第一个字易发粗）
  const nextSvg = createTianzigeSvg(CELL_SIZE)
  slot.frame.replaceChild(nextSvg, slot.svg)
  slot.svg = nextSvg
  slot.writerGen += 1
  const gen = slot.writerGen
  slot.writer = null

  try {
    slot.writer = HanziWriter.create(slot.svg, slot.char, {
      ...writerOptions(),
      onLoadCharDataSuccess: () => {
        if (gen !== slot.writerGen) return
      },
      onLoadCharDataError: () => {
        if (gen !== slot.writerGen) return
        slot.cell.classList.add('error')
        slot.label.textContent = `${slot.char} · 无数据`
        slot.writer = null
      },
    })
  } catch {
    slot.cell.classList.add('error')
    slot.label.textContent = `${slot.char} · 无数据`
    slot.writer = null
  }
}

function setEmptyState(message: string) {
  stageReading.textContent = ''
  gridEl.innerHTML = `
    <div class="empty-state">
      <strong>暂无汉字</strong>
      ${message}
    </div>
  `
}

function updateStageReading() {
  if (slots.length === 0) {
    stageReading.textContent = ''
    return
  }
  stageReading.textContent = getTextReading(slots.map((slot) => slot.char))
}

function clearSlots() {
  animToken += 1
  looping = false
  slots = []
  gridEl.innerHTML = ''
  setPlaybackState('idle')
}

function markPlaying(index: number | null) {
  slots.forEach((slot, i) => {
    slot.cell.classList.toggle('playing', index !== null && i === index)
  })
}

function buildSlots(chars: string[]) {
  clearSlots()

  if (chars.length === 0) {
    setEmptyState('请输入至少一个汉字后点击「展示」')
    updatePlaybackControls()
    return
  }

  chars.forEach((char, index) => {
    const reading = getCharReading(char)
    const cell = document.createElement('div')
    cell.className = 'char-cell'
    cell.style.animationDelay = `${index * 40}ms`

    const pinyinBtn = document.createElement('button')
    pinyinBtn.type = 'button'
    pinyinBtn.className = reading.isPolyphone
      ? 'char-pinyin is-polyphone'
      : 'char-pinyin'
    pinyinBtn.textContent = reading.primary
    pinyinBtn.title = reading.isPolyphone
      ? `朗读「${char}」· 多音 ${reading.full}`
      : `朗读「${char}」`
    pinyinBtn.setAttribute(
      'aria-label',
      `朗读 ${char}，${reading.full}`,
    )

    const svg = createTianzigeSvg(CELL_SIZE)
    const frame = document.createElement('button')
    frame.type = 'button'
    frame.className = 'tianzige'
    frame.setAttribute('aria-label', `播放 ${char} 笔顺`)
    frame.appendChild(svg)

    const label = document.createElement('span')
    label.className = 'char-label'
    label.textContent = char

    cell.append(pinyinBtn, frame, label)
    gridEl.appendChild(cell)

    const slot: CharSlot = {
      char,
      reading,
      writer: null,
      cell,
      frame,
      svg,
      label,
      writerGen: 0,
    }
    slots.push(slot)
    attachWriter(slot)

    pinyinBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      stageReading.textContent = `${char} · ${reading.full}`
      void speakText(char)
    })

    frame.addEventListener('click', () => {
      stageReading.textContent = `${char} · ${reading.full}`
      void playIndices([index])
    })
  })

  updateStageReading()
  updatePlaybackControls()
}

function animateSlot(slot: CharSlot, token: number): Promise<boolean> {
  attachWriter(slot)
  if (!slot.writer || token !== animToken) return Promise.resolve(false)

  const writer = slot.writer
  const gen = slot.writerGen

  return new Promise((resolve) => {
    writer
      .animateCharacter({
        onComplete: () => {
          if (gen !== slot.writerGen || token !== animToken) {
            resolve(false)
            return
          }
          // 播完仍保留底稿，并确保只显示一层
          void writer
            .showOutline()
            .catch(() => undefined)
            .finally(() => resolve(token === animToken && gen === slot.writerGen))
        },
      })
      .catch(() => resolve(false))
  })
}

async function playSequence(indices: number[], token: number) {
  for (const index of indices) {
    if (token !== animToken) return
    const slot = slots[index]
    if (!slot) continue

    markPlaying(index)
    stageReading.textContent = `${slot.char} · ${slot.reading.full}`
    void speakText(slot.char)
    const ok = await animateSlot(slot, token)
    if (!ok) return
  }
  markPlaying(null)
  updateStageReading()
}

async function playIndices(indices: number[]) {
  if (indices.length === 0) return
  if (playbackState === 'playing' || playbackState === 'looping') {
    stopPlay()
  }

  const token = ++animToken
  looping = false
  setPlaybackState('playing')
  await playSequence(indices, token)
  if (token === animToken) setPlaybackState('idle')
}

async function playCurrent() {
  if (slots.length === 0) return
  if (playbackState === 'playing') {
    stopPlay()
    return
  }
  await playIndices(slots.map((_, i) => i))
}

async function loopPlay() {
  if (slots.length === 0) return
  if (playbackState === 'looping') {
    stopPlay()
    return
  }

  looping = true
  const token = ++animToken
  setPlaybackState('looping')

  while (looping && token === animToken) {
    await playSequence(
      slots.map((_, i) => i),
      token,
    )
    if (!looping || token !== animToken) break
    await new Promise((r) => setTimeout(r, 450))
  }
  if (token === animToken) setPlaybackState('idle')
}

function stopPlay() {
  animToken += 1
  looping = false
  markPlaying(null)
  stopSpeaking()
  for (const slot of slots) {
    if (slot.cell.classList.contains('error')) continue
    attachWriter(slot)
  }
  setPlaybackState('idle')
}

async function speakCurrent() {
  if (slots.length === 0) return
  if (playbackState === 'speaking') {
    stopSpeaking()
    setPlaybackState('idle')
    return
  }

  setPlaybackState('speaking')
  try {
    await speakText(slots.map((slot) => slot.char).join(''))
  } finally {
    // 朗读结束且未被播放/循环接管时回到空闲
    if (playbackState !== 'playing' && playbackState !== 'looping') {
      setPlaybackState('idle')
    }
  }
}

function renderPresets(active?: string) {
  presetsEl.innerHTML = ''
  for (const text of PRESET_TEXTS) {
    const chip = document.createElement('button')
    chip.type = 'button'
    chip.className = 'chip'
    chip.textContent = text
    if (text === active) chip.classList.add('active')
    chip.addEventListener('click', () => {
      input.value = text
      showText(text)
      renderPresets(text)
    })
    presetsEl.appendChild(chip)
  }
}

function showText(raw: string) {
  const chars = extractHanzi(raw)
  input.value = chars.join('') || raw
  buildSlots(chars)
  if (chars.length > 0) {
    window.setTimeout(() => void playCurrent(), 200)
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault()
  const value = input.value.trim()
  const matched = (PRESET_TEXTS as readonly string[]).includes(value)
    ? value
    : undefined
  renderPresets(matched)
  showText(value)
})

toggleGrid.addEventListener('change', () => {
  stageEl.classList.toggle('hide-grid', !toggleGrid.checked)
})

speedInput.addEventListener('input', () => {
  strokeSpeed = Number(speedInput.value) || 1
})

btnPlay.addEventListener('click', () => void playCurrent())
btnSpeak.addEventListener('click', () => void speakCurrent())
btnLoop.addEventListener('click', () => void loopPlay())
btnStop.addEventListener('click', () => stopPlay())
updatePlaybackControls()

function selectFromTable(text: string) {
  renderPresets()
  showText(text)
}

async function initCharTable() {
  const mount = app.querySelector<HTMLElement>('#char-table')!
  try {
    const table = await loadMoeCharTable()
    mountCharTable(table, {
      mount,
      onSelect: (char) => selectFromTable(char),
      onSelectMany: (text) => selectFromTable(text),
    })
  } catch {
    mount.innerHTML = `
      <div class="table-head">
        <h2 class="table-title">教育部汉字表</h2>
        <p class="table-source">字表加载失败，请刷新后重试</p>
      </div>
    `
  }
}

renderPresets(DEFAULT_TEXT)
showText(DEFAULT_TEXT)
void initCharTable()
