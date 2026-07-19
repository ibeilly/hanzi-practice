import { pinyin } from 'pinyin-pro'

export interface CharLevel {
  id: string
  name: string
  desc: string
  chars: string[]
}

export interface MoeCharTable {
  source: string
  levels: CharLevel[]
}

export interface CharTableOptions {
  mount: HTMLElement
  onSelect: (char: string) => void
  onSelectMany?: (text: string) => void
}

const PAGE_SIZE = 100

export async function loadMoeCharTable(): Promise<MoeCharTable> {
  const res = await fetch('/data/moe-characters.json')
  if (!res.ok) throw new Error('汉字表加载失败')
  return res.json() as Promise<MoeCharTable>
}

export function mountCharTable(
  table: MoeCharTable,
  { mount, onSelect, onSelectMany }: CharTableOptions,
) {
  let levelIndex = 0
  let page = 0
  let query = ''
  let multi = false
  const selected = new Set<string>()

  mount.innerHTML = `
    <div class="table-head">
      <div class="table-title-row">
        <h2 class="table-title">教育部汉字表</h2>
        <button type="button" class="btn btn-ghost table-toggle" id="table-toggle" aria-expanded="true">收起</button>
      </div>
      <p class="table-source">${table.source} · 共 ${table.levels.reduce((n, l) => n + l.chars.length, 0)} 字</p>
    </div>
    <div class="table-body" id="table-body">
      <div class="table-controls">
        <div class="level-tabs" role="tablist" aria-label="字表分级"></div>
        <div class="table-tools">
          <input
            id="table-filter"
            type="search"
            placeholder="在当前字表中筛选，如：永"
            autocomplete="off"
          />
          <label class="jump-control">
            字序
            <input id="table-jump" type="number" min="1" step="1" placeholder="1" />
          </label>
          <label class="toggle">
            <input type="checkbox" id="table-multi" />
            多选
          </label>
          <button type="button" class="btn btn-primary" id="table-show-selected" disabled>展示选中</button>
        </div>
      </div>
      <div class="table-meta" id="table-meta"></div>
      <div class="table-chars" id="table-chars" role="listbox" aria-label="汉字快速选择"></div>
      <div class="table-pager" id="table-pager"></div>
    </div>
  `

  const body = mount.querySelector<HTMLElement>('#table-body')!
  const toggleBtn = mount.querySelector<HTMLButtonElement>('#table-toggle')!
  const levelTabs = mount.querySelector<HTMLDivElement>('.level-tabs')!
  const filterInput = mount.querySelector<HTMLInputElement>('#table-filter')!
  const jumpInput = mount.querySelector<HTMLInputElement>('#table-jump')!
  const multiInput = mount.querySelector<HTMLInputElement>('#table-multi')!
  const showSelectedBtn = mount.querySelector<HTMLButtonElement>('#table-show-selected')!
  const metaEl = mount.querySelector<HTMLDivElement>('#table-meta')!
  const charsEl = mount.querySelector<HTMLDivElement>('#table-chars')!
  const pagerEl = mount.querySelector<HTMLDivElement>('#table-pager')!

  table.levels.forEach((level, index) => {
    const tab = document.createElement('button')
    tab.type = 'button'
    tab.className = 'mode-tab'
    tab.setAttribute('role', 'tab')
    tab.dataset.level = String(index)
    tab.textContent = `${level.name}（${level.chars.length}）`
    tab.addEventListener('click', () => {
      levelIndex = index
      page = 0
      query = ''
      filterInput.value = ''
      render()
    })
    levelTabs.appendChild(tab)
  })

  function filteredEntries(): { char: string; index: number }[] {
    const level = table.levels[levelIndex]!
    const q = query.trim()
    const entries = level.chars.map((char, index) => ({ char, index }))
    if (!q) return entries
    return entries.filter(({ char, index }) => {
      if (char.includes(q)) return true
      const ord = String(index + 1)
      return ord === q || ord.startsWith(q)
    })
  }

  function updateSelectedBtn() {
    showSelectedBtn.disabled = selected.size === 0
    showSelectedBtn.textContent =
      selected.size > 0 ? `展示选中（${selected.size}）` : '展示选中'
  }

  function renderPager(total: number) {
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    page = Math.min(page, totalPages - 1)
    pagerEl.innerHTML = ''

    const prev = document.createElement('button')
    prev.type = 'button'
    prev.className = 'btn btn-ghost'
    prev.textContent = '上一页'
    prev.disabled = page <= 0
    prev.addEventListener('click', () => {
      page -= 1
      render()
    })

    const info = document.createElement('span')
    info.className = 'pager-info'
    info.textContent = `${page + 1} / ${totalPages}`

    const next = document.createElement('button')
    next.type = 'button'
    next.className = 'btn btn-ghost'
    next.textContent = '下一页'
    next.disabled = page >= totalPages - 1
    next.addEventListener('click', () => {
      page += 1
      render()
    })

    pagerEl.append(prev, info, next)
  }

  function render() {
    const level = table.levels[levelIndex]!
    Array.from(levelTabs.children).forEach((el, index) => {
      el.classList.toggle('active', index === levelIndex)
    })

    const entries = filteredEntries()
    const start = page * PAGE_SIZE
    const pageEntries = entries.slice(start, start + PAGE_SIZE)

    metaEl.textContent = query
      ? `${level.name} · 筛选到 ${entries.length} 字 · 本页 ${pageEntries.length} 字`
      : `${level.desc} · 字序 ${(pageEntries[0]?.index ?? 0) + 1}–${
          (pageEntries.at(-1)?.index ?? -1) + 1
        }`

    jumpInput.max = String(level.chars.length)
    jumpInput.placeholder = `1–${level.chars.length}`

    charsEl.innerHTML = ''
    if (pageEntries.length === 0) {
      charsEl.innerHTML = `<div class="table-empty">当前筛选无结果</div>`
    } else {
      for (const { char, index } of pageEntries) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'table-char'
        btn.setAttribute('role', 'option')
        const reading = pinyin(char, { toneType: 'symbol' })
        btn.title = `${char} ${reading} · 字序 ${index + 1}`
        btn.setAttribute('aria-label', `${char}，${reading}`)
        btn.textContent = char
        if (selected.has(char)) btn.classList.add('selected')
        btn.addEventListener('click', () => {
          if (multi) {
            if (selected.has(char)) selected.delete(char)
            else selected.add(char)
            btn.classList.toggle('selected', selected.has(char))
            updateSelectedBtn()
            return
          }
          onSelect(char)
        })
        charsEl.appendChild(btn)
      }
    }

    renderPager(entries.length)
    updateSelectedBtn()
  }

  toggleBtn.addEventListener('click', () => {
    const collapsed = body.classList.toggle('collapsed')
    toggleBtn.textContent = collapsed ? '展开' : '收起'
    toggleBtn.setAttribute('aria-expanded', String(!collapsed))
  })

  filterInput.addEventListener('input', () => {
    query = filterInput.value
    page = 0
    render()
  })

  jumpInput.addEventListener('change', () => {
    const level = table.levels[levelIndex]!
    const n = Number(jumpInput.value)
    if (!Number.isFinite(n) || n < 1 || n > level.chars.length) return
    query = ''
    filterInput.value = ''
    page = Math.floor((n - 1) / PAGE_SIZE)
    render()
    const target = charsEl.querySelectorAll('.table-char')[(n - 1) % PAGE_SIZE] as
      | HTMLButtonElement
      | undefined
    target?.focus()
    target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })

  multiInput.addEventListener('change', () => {
    multi = multiInput.checked
    if (!multi) {
      selected.clear()
      render()
    }
    updateSelectedBtn()
  })

  showSelectedBtn.addEventListener('click', () => {
    if (selected.size === 0) return
    const level = table.levels[levelIndex]!
    const ordered = level.chars.filter((c) => selected.has(c))
    // also include selected from other levels in selection order fallback
    const rest = [...selected].filter((c) => !ordered.includes(c))
    const chars = [...ordered, ...rest]
    onSelectMany?.(chars.join(''))
  })

  render()
}
