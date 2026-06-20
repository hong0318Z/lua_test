import { create } from 'zustand'

const LS_SOURCE = 'lua_test.source'
const LS_MARKER = 'lua_test.marker'
const LS_SETTINGS = 'lua_test.settings'

export const DEEPSEEK_MODELS = ['deepseek-chat', 'deepseek-reasoner'] as const
export type DeepseekModel = (typeof DEEPSEEK_MODELS)[number]

// deepseek-chat / deepseek-reasoner 둘 다 컨텍스트 윈도우 64K, 최대 출력
// 토큰은 베타 헤더(output 8k/64k)를 켰을 때 기준 상한. "최대 컨텍스트,
// 최대 출력"을 기본값으로 깔아둔다.
export const MAX_CONTEXT_TOKENS = 65536
export const MAX_OUTPUT_TOKENS: Record<DeepseekModel, number> = {
  'deepseek-chat': 8192,
  'deepseek-reasoner': 65536,
}

export interface Settings {
  apiKey: string
  model: DeepseekModel
  maxOutputTokens: number
}

const DEFAULT_SOURCE = `-- RisuAI 캐릭터 스크립트를 여기에 붙여넣거나 직접 작성하세요.
-- onStart / onInput / onOutput / listenEdit('editDisplay', ...) 패턴을 그대로 씁니다.

local function buildPanel(id)
  local html = [[
    <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;
                background:linear-gradient(135deg,#1a1a2e,#16213e);color:#eee;font-family:sans-serif;">
      <div style="text-align:center;">
        <h2 style="margin:0 0 8px;">패널 준비됨</h2>
        <p style="opacity:.7;margin:0;">왼쪽 에디터에 캐릭터 스크립트를 작성하세요</p>
      </div>
    </div>
  ]]
  return html
end

function onStart(id)
  setState(id, "turn", 0)
end

function onOutput(id)
  setState(id, "turn", (getState(id, "turn") or 0) + 1)
end

listenEdit('editDisplay', function(id, data)
  if data:match("^%s*<!%-%-panel%-%->#?%d*%s*$") then
    return buildPanel(id)
  end
  return data
end)
`

export const DEFAULT_MARKER = '<!--panel-->'

function loadSource(): string {
  return localStorage.getItem(LS_SOURCE) ?? DEFAULT_SOURCE
}

function loadMarker(): string {
  return localStorage.getItem(LS_MARKER) ?? DEFAULT_MARKER
}

function loadSettings(): Settings {
  const raw = localStorage.getItem(LS_SETTINGS)
  const defaults: Settings = { apiKey: '', model: 'deepseek-chat', maxOutputTokens: MAX_OUTPUT_TOKENS['deepseek-chat'] }
  if (!raw) return defaults
  try {
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return defaults
  }
}

export interface SelectedElement {
  selector: string
  tag: string
  outerHtmlSnippet: string
  classes: string[]
  id: string | null
  textSample: string
}

interface AppState {
  source: string
  marker: string
  settings: Settings
  panelHtml: string
  stateDump: Record<string, unknown>
  compileError: string | null
  runtimeError: string | null
  selected: SelectedElement | null
  activeAiTab: 'edit' | 'explain'
  settingsOpen: boolean

  setSource: (s: string) => void
  setMarker: (m: string) => void
  setSettings: (s: Partial<Settings>) => void
  setPanelHtml: (h: string) => void
  setStateDump: (s: Record<string, unknown>) => void
  setCompileError: (e: string | null) => void
  setRuntimeError: (e: string | null) => void
  setSelected: (s: SelectedElement | null) => void
  setActiveAiTab: (t: 'edit' | 'explain') => void
  setSettingsOpen: (v: boolean) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  source: loadSource(),
  marker: loadMarker(),
  settings: loadSettings(),
  panelHtml: '',
  stateDump: {},
  compileError: null,
  runtimeError: null,
  selected: null,
  activeAiTab: 'edit',
  settingsOpen: false,

  setSource: (s) => {
    localStorage.setItem(LS_SOURCE, s)
    set({ source: s })
  },
  setMarker: (m) => {
    localStorage.setItem(LS_MARKER, m)
    set({ marker: m })
  },
  setSettings: (partial) => {
    const next = { ...get().settings, ...partial }
    localStorage.setItem(LS_SETTINGS, JSON.stringify(next))
    set({ settings: next })
  },
  setPanelHtml: (h) => set({ panelHtml: h }),
  setStateDump: (s) => set({ stateDump: s }),
  setCompileError: (e) => set({ compileError: e }),
  setRuntimeError: (e) => set({ runtimeError: e }),
  setSelected: (s) => set({ selected: s }),
  setActiveAiTab: (t) => set({ activeAiTab: t }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
}))
