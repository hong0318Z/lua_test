import { useAppStore } from '../state/store'

export function StatePanel() {
  const stateDump = useAppStore((s) => s.stateDump)
  const compileError = useAppStore((s) => s.compileError)
  const runtimeError = useAppStore((s) => s.runtimeError)

  return (
    <div className="state-panel">
      {compileError && (
        <div className="error-box">
          <strong>문법 오류 (luac -p 격)</strong>
          <pre>{compileError}</pre>
        </div>
      )}
      {!compileError && runtimeError && (
        <div className="error-box">
          <strong>런타임 오류</strong>
          <pre>{runtimeError}</pre>
        </div>
      )}
      <div className="state-dump-header">state 덤프</div>
      <pre className="state-dump">{JSON.stringify(stateDump, null, 2)}</pre>
    </div>
  )
}
