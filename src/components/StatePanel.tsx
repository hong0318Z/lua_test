import { useAppStore } from '../state/store'

export function StatePanel() {
  const stateDump = useAppStore((s) => s.stateDump)
  const compileError = useAppStore((s) => s.compileError)
  const runtimeError = useAppStore((s) => s.runtimeError)
  const diagnostics = useAppStore((s) => s.diagnostics)
  const setDiagnostics = useAppStore((s) => s.setDiagnostics)

  return (
    <div className="state-panel">
      {diagnostics && (
        <div className="diagnostics-box">
          <div className="diagnostics-header">
            <strong>전체 점검 결과</strong>
            <button onClick={() => setDiagnostics(null)}>닫기</button>
          </div>
          {diagnostics.map((d, i) => (
            <div key={i} className={d.ok ? 'diagnostics-item ok' : 'diagnostics-item fail'}>
              <span className="diagnostics-stage">
                {d.ok ? '✓' : '✗'} {d.stage}
              </span>
              {!d.ok && <pre>{d.error}</pre>}
            </div>
          ))}
        </div>
      )}
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
