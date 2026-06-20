import { useCallback, useEffect, useState } from 'react'
import { LuaEditor } from './components/LuaEditor'
import { ScreenPreview } from './components/ScreenPreview'
import { Inspector } from './components/Inspector'
import { AiPanel } from './components/AiPanel'
import { ControlBar } from './components/ControlBar'
import { StatePanel } from './components/StatePanel'
import { SettingsModal } from './components/SettingsModal'
import { LuaRuntime } from './lua/luaRuntime'
import { useAppStore } from './state/store'
import './App.css'

export default function App() {
  const source = useAppStore((s) => s.source)
  const marker = useAppStore((s) => s.marker)
  const setPanelHtml = useAppStore((s) => s.setPanelHtml)
  const panelHtml = useAppStore((s) => s.panelHtml)
  const setStateDump = useAppStore((s) => s.setStateDump)
  const setCompileError = useAppStore((s) => s.setCompileError)
  const setRuntimeError = useAppStore((s) => s.setRuntimeError)
  const setSelected = useAppStore((s) => s.setSelected)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)

  const [runtime] = useState(() => new LuaRuntime())

  const [busy, setBusy] = useState(false)
  const [jumpToLine, setJumpToLine] = useState<number | null>(null)

  const refreshPanelOnly = useCallback(async () => {
    const rt = runtime
    const loadResult = await rt.loadScript(source)
    if (!loadResult.ok) {
      setCompileError(loadResult.error)
      return
    }
    setCompileError(null)
    const editResult = await rt.triggerEdit(marker)
    if (editResult.ok) {
      setRuntimeError(null)
      setPanelHtml(editResult.html)
    } else {
      setRuntimeError(editResult.error)
    }
    setStateDump(await rt.dumpState())
  }, [source, marker, runtime, setCompileError, setRuntimeError, setPanelHtml, setStateDump])

  // 소스가 바뀌면(직접 수정 또는 AI 적용) 디바운스 후 자동으로 다시 로드 + 패널 새로고침.
  // RisuAI가 콜백마다 스크립트 전체를 재실행하는 특성(가이드 PART 1-1)을 그대로 흉내낸다.
  useEffect(() => {
    const t = setTimeout(() => {
      refreshPanelOnly()
    }, 500)
    return () => clearTimeout(t)
  }, [refreshPanelOnly])

  async function runWithAction(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true)
    try {
      const rt = runtime
      const loadResult = await rt.loadScript(source)
      if (!loadResult.ok) {
        setCompileError(loadResult.error)
        return
      }
      setCompileError(null)
      const actionResult = await action()
      if (!actionResult.ok) {
        setRuntimeError(actionResult.error ?? '알 수 없는 오류')
      }
      const editResult = await rt.triggerEdit(marker)
      if (editResult.ok) {
        setRuntimeError(null)
        setPanelHtml(editResult.html)
      } else if (actionResult.ok) {
        setRuntimeError(editResult.error)
      }
      setStateDump(await rt.dumpState())
    } finally {
      setBusy(false)
    }
  }

  async function handleNewChat() {
    await runtime.resetAll()
    await runWithAction(() => runtime.onStart())
  }

  async function handleUserMessage(text: string) {
    if (!text.trim()) return
    await runtime.addUserMessage(text)
    await runWithAction(() => runtime.onInput())
  }

  async function handleCharMessage(text: string) {
    if (!text.trim()) return
    await runtime.addCharMessage(text)
    await runWithAction(() => runtime.onOutput())
  }

  async function handleRefreshPanel() {
    setBusy(true)
    try {
      await refreshPanelOnly()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-grid">
      <header className="app-header">
        <h1>RisuAI Lua 테스트 워크벤치</h1>
        <button className="settings-open-btn" onClick={() => setSettingsOpen(true)}>
          ⚙ DeepSeek 설정
        </button>
      </header>

      <section className="pane pane-editor">
        <LuaEditor jumpToLine={jumpToLine} />
      </section>

      <section className="pane pane-preview">
        <ControlBar
          busy={busy}
          onNewChat={handleNewChat}
          onUserMessage={handleUserMessage}
          onCharMessage={handleCharMessage}
          onRefreshPanel={handleRefreshPanel}
        />
        <ScreenPreview html={panelHtml} onSelect={setSelected} />
        <Inspector onJump={(line) => setJumpToLine(line)} />
      </section>

      <section className="pane pane-state">
        <div className="pane-state-top">
          <StatePanel />
        </div>
        <div className="pane-state-bottom">
          <AiPanel />
        </div>
      </section>

      <SettingsModal />
    </div>
  )
}
