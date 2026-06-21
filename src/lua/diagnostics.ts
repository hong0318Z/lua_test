import { LuaRuntime } from './luaRuntime'

export interface DiagnosticEntry {
  stage: string
  ok: boolean
  error?: string
}

// 컴파일 + onStart + onInput + onOutput + editDisplay를 한 번에 돌려서 모든
// 단계의 결과를 모아 반환한다. 현재 테스트 중인 세션(runtime)의 state를 건드리지
// 않도록 매번 새 임시 엔진을 띄워서 검사한다.
export async function runFullDiagnostics(source: string, marker: string): Promise<DiagnosticEntry[]> {
  const diag = new LuaRuntime()
  const results: DiagnosticEntry[] = []

  const loadResult = await diag.loadScript(source)
  results.push({ stage: '문법 (컴파일)', ok: loadResult.ok, error: loadResult.ok ? undefined : loadResult.error })
  if (!loadResult.ok) return results

  const startResult = await diag.onStart()
  results.push({ stage: 'onStart', ok: startResult.ok, error: startResult.ok ? undefined : startResult.error })

  const inputResult = await diag.onInput()
  results.push({ stage: 'onInput', ok: inputResult.ok, error: inputResult.ok ? undefined : inputResult.error })

  const outputResult = await diag.onOutput()
  results.push({ stage: 'onOutput', ok: outputResult.ok, error: outputResult.ok ? undefined : outputResult.error })

  const editResult = await diag.triggerEdit(marker)
  results.push({ stage: '패널 (editDisplay)', ok: editResult.ok, error: editResult.ok ? undefined : editResult.error })

  return results
}
