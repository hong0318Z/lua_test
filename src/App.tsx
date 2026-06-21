import { useCallback, useEffect, useState } from 'react'
import { LuaEditor } from './components/LuaEditor'
import { ScreenPreview } from './components/ScreenPreview'
import { Inspector } from './components/Inspector'
import { AiPanel } from './components/AiPanel'
import { ControlBar } from './components/ControlBar'
import { StatePanel } from './components/StatePanel'
import { SettingsModal } from './components/SettingsModal'
import { ToolsPanel } from './components/ToolsPanel'
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
  const activeAppView = useAppStore((s) => s.activeAppView)
  const setActiveAppView = useAppStore((s) => s.setActiveAppView)
  const setDiagnostics = useAppStore((s) => s.setDiagnostics)
  const setDiagnosticsRunning = useAppStore((s) => s.setDiagnosticsRunning)

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

  async function runWithAction(actionLabel: string, action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true)
    try {
      const rt = runtime
      const loadResult = await rt.loadScript(source)
      if (!loadResult.ok) {
        setCompileError(loadResult.error)
        return
      }
      setCompileError(null)
      // 액션(onStart/onInput/onOutput)과 editDisplay 둘 다 실패할 수 있으므로
      // 한쪽이 가리지 않도록 발생한 오류를 모두 모아서 같이 보여준다.
      const errors: string[] = []
      const actionResult = await action()
      if (!actionResult.ok) errors.push(`[${actionLabel}] ${actionResult.error ?? '알 수 없는 오류'}`)

      const editResult = await rt.triggerEdit(marker)
      if (editResult.ok) {
        setPanelHtml(editResult.html)
      } else {
        errors.push(`[editDisplay] ${editResult.error}`)
      }
      setRuntimeError(errors.length > 0 ? errors.join('\n\n') : null)
      setStateDump(await rt.dumpState())
    } finally {
      setBusy(false)
    }
  }

  async function handleNewChat() {
    await runtime.resetAll()
    await runWithAction('onStart', () => runtime.onStart())
  }

  async function handleUserMessage(text: string) {
    if (!text.trim()) return
    await runtime.addUserMessage(text)
    await runWithAction('onInput', () => runtime.onInput())
  }

  async function handleCharMessage(text: string) {
    if (!text.trim()) return
    await runtime.addCharMessage(text)
    await runWithAction('onOutput', () => runtime.onOutput())
  }

  async function handleRefreshPanel() {
    setBusy(true)
    try {
      await refreshPanelOnly()
    } finally {
      setBusy(false)
    }
  }

  // 컴파일/onStart/onInput/onOutput/editDisplay를 한 번에 모두 돌려서 발견되는
  // 모든 오류를 동시에 보여준다 (현재 테스트 중인 세션의 state는 건드리지 않도록
  // 별도의 임시 Lua 엔진을 사용한다).
  async function handleFullCheck() {
    setDiagnosticsRunning(true)
    try {
      const diag = new LuaRuntime()
      const results: { stage: string; ok: boolean; error?: string }[] = []

      const loadResult = await diag.loadScript(source)
      results.push({ stage: '문법 (컴파일)', ok: loadResult.ok, error: loadResult.ok ? undefined : loadResult.error })
      if (!loadResult.ok) {
        setDiagnostics(results)
        return
      }

      const startResult = await diag.onStart()
      results.push({ stage: 'onStart', ok: startResult.ok, error: startResult.ok ? undefined : startResult.error })

      const inputResult = await diag.onInput()
      results.push({ stage: 'onInput', ok: inputResult.ok, error: inputResult.ok ? undefined : inputResult.error })

      const outputResult = await diag.onOutput()
      results.push({ stage: 'onOutput', ok: outputResult.ok, error: outputResult.ok ? undefined : outputResult.error })

      const editResult = await diag.triggerEdit(marker)
      results.push({ stage: '패널 (editDisplay)', ok: editResult.ok, error: editResult.ok ? undefined : editResult.error })

      setDiagnostics(results)
    } finally {
      setDiagnosticsRunning(false)
    }
  }

  return (
    <div className="app-grid">
      <header className="app-header">
        <h1>RisuAI Lua 테스트 워크벤치</h1>
        <nav className="app-view-tabs">
          <button
            className={activeAppView === 'workbench' ? 'app-view-tab active' : 'app-view-tab'}
            onClick={() => setActiveAppView('workbench')}
          >
            워크벤치
          </button>
          <button
            className={activeAppView === 'tools' ? 'app-view-tab active' : 'app-view-tab'}
            onClick={() => setActiveAppView('tools')}
          >
            정규식/포맷 도구
          </button>
        </nav>
        <button className="settings-open-btn" onClick={() => setSettingsOpen(true)}>
          ⚙ DeepSeek 설정
        </button>
      </header>

      {activeAppView === 'workbench' ? (
        <>
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
              onFullCheck={handleFullCheck}
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
        </>
      ) : (
        <section className="pane pane-tools-full">
          <ToolsPanel />
        </section>
      )}

      <SettingsModal />
    </div>
  )
}
