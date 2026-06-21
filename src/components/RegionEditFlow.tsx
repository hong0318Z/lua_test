import { useState } from 'react'
import { useAppStore } from '../state/store'
import { checkSyntax, runFullDiagnostics, type DiagnosticEntry } from '../lua/diagnostics'
import {
  analysisSystemPrompt,
  applyRegionEdits,
  buildHistoryContext,
  buildRegionContext,
  callDeepseek,
  editRegionSystemPrompt,
  extractRegionReplacement,
  numberLines,
  parseEditRegions,
  planSystemPrompt,
  summarySystemPrompt,
  type ChatMessage,
  type EditHistoryEntry,
  type EditRegion,
} from '../ai/deepseek'

interface RegionDraft {
  region: EditRegion
  newText: string | null
  error: string | null
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'discussing'; request: string; messages: ChatMessage[] }
  | { kind: 'planning' }
  | { kind: 'awaiting-approval'; regions: EditRegion[]; snapshot: string; request: string }
  | { kind: 'editing'; regions: EditRegion[]; snapshot: string; request: string; drafts: RegionDraft[] }
  | { kind: 'review'; snapshot: string; request: string; drafts: RegionDraft[] }
  | { kind: 'error'; message: string }

export function RegionEditFlow() {
  const settings = useAppStore((s) => s.settings)
  const source = useAppStore((s) => s.source)
  const setSource = useAppStore((s) => s.setSource)
  const marker = useAppStore((s) => s.marker)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)

  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [lastAppliedSnapshot, setLastAppliedSnapshot] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [history, setHistory] = useState<EditHistoryEntry[]>([])
  const [changeSummary, setChangeSummary] = useState<string | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [postCheck, setPostCheck] = useState<DiagnosticEntry[] | null>(null)
  const [postCheckRunning, setPostCheckRunning] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applyChecking, setApplyChecking] = useState(false)
  const [discussLoading, setDiscussLoading] = useState(false)

  function requireApiKey(): boolean {
    if (!settings.apiKey) {
      setPhase({ kind: 'error', message: 'DeepSeek API 키가 설정되지 않았습니다.' })
      setSettingsOpen(true)
      return false
    }
    return true
  }

  async function runPlanning(request: string, extraContext: string) {
    setPhase({ kind: 'planning' })
    try {
      const historyText = buildHistoryContext(history)
      const messages: ChatMessage[] = [
        { role: 'system', content: planSystemPrompt() },
        {
          role: 'user',
          content: `${historyText}요청: ${request}\n${extraContext}\n줄 번호가 매겨진 전체 소스:\n${numberLines(source)}`,
        },
      ]
      const reply = await callDeepseek({
        apiKey: settings.apiKey,
        model: settings.model,
        maxOutputTokens: settings.maxOutputTokens,
        messages,
      })
      const regions = parseEditRegions(reply)
      if (regions.length === 0) {
        setPhase({ kind: 'error', message: '수정이 필요한 영역을 찾지 못했습니다. 요청을 더 구체적으로 입력해보세요.' })
        return
      }
      setPhase({ kind: 'awaiting-approval', regions, snapshot: source, request })
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }

  // 바로 영역 식별로 들어가지 않고, 먼저 AI가 요청을 어떻게 이해했는지 자연어로 설명하고
  // 사용자가 대화로 확인/보정한 뒤 "계획대로 진행"을 눌러야 실제 영역 식별이 시작된다.
  function startPlanning(explicitRequest?: string) {
    const request = (explicitRequest ?? input).trim()
    if (!request || !requireApiKey()) return
    setInput('')
    askAnalysis(request, [
      {
        role: 'user',
        content: `요청: ${request}\n\n줄 번호가 매겨진 전체 소스:\n${numberLines(source)}`,
      },
    ])
  }

  async function askAnalysis(request: string, messages: ChatMessage[]) {
    setPhase({ kind: 'discussing', request, messages })
    setDiscussLoading(true)
    try {
      const reply = await callDeepseek({
        apiKey: settings.apiKey,
        model: settings.model,
        maxOutputTokens: settings.maxOutputTokens,
        messages: [{ role: 'system', content: analysisSystemPrompt() }, ...messages],
      })
      setPhase((prev) =>
        prev.kind === 'discussing' ? { ...prev, messages: [...prev.messages, { role: 'assistant', content: reply }] } : prev,
      )
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setDiscussLoading(false)
    }
  }

  function continueDiscussion(text: string) {
    if (phase.kind !== 'discussing') return
    const trimmed = text.trim()
    if (!trimmed) return
    setInput('')
    askAnalysis(phase.request, [...phase.messages, { role: 'user', content: trimmed }])
  }

  function confirmAndPlan() {
    if (phase.kind !== 'discussing') return
    const discussionText = phase.messages
      .map((m, i) => `${m.role === 'user' ? '사용자' : 'AI'}: ${i === 0 && m.role === 'user' ? phase.request : m.content}`)
      .join('\n\n')
    runPlanning(phase.request, `\n대화를 통해 확인/보정된 내용:\n${discussionText}\n\n`)
  }

  async function approveAndEdit(regions: EditRegion[], snapshot: string, request: string) {
    const drafts: RegionDraft[] = regions.map((region) => ({ region, newText: null, error: null }))
    setPhase({ kind: 'editing', regions, snapshot, request, drafts })

    const results = await Promise.all(
      regions.map(async (region) => {
        try {
          const { contextText } = buildRegionContext(snapshot, region)
          const messages: ChatMessage[] = [
            { role: 'system', content: editRegionSystemPrompt() },
            {
              role: 'user',
              content:
                `전체 요청: ${request}\n` +
                `이 영역을 고른 이유: ${region.reason}\n` +
                `대상 영역: ${region.startLine}~${region.endLine}번째 줄\n\n` +
                `줄 번호가 매겨진 주변 컨텍스트(대상 영역 포함):\n${contextText}`,
            },
          ]
          const reply = await callDeepseek({
            apiKey: settings.apiKey,
            model: settings.model,
            maxOutputTokens: settings.maxOutputTokens,
            messages,
          })
          const newText = extractRegionReplacement(reply)
          return { region, newText, error: null }
        } catch (e) {
          return { region, newText: null, error: e instanceof Error ? e.message : String(e) }
        }
      }),
    )

    setSelected(new Set(results.map((_, i) => i).filter((i) => results[i].newText !== null)))
    setApplyError(null)
    setPhase({ kind: 'review', snapshot, request, drafts: results })
  }

  async function applySelected(snapshot: string, request: string, drafts: RegionDraft[]) {
    const edits = drafts
      .map((d, i) => ({ d, i }))
      .filter(({ d, i }) => d.newText !== null && selected.has(i))
      .map(({ d }) => ({ region: d.region, newText: d.newText! }))
    if (edits.length === 0) return
    const next = applyRegionEdits(snapshot, edits)

    setApplyError(null)
    setApplyChecking(true)
    let syntaxResult: { ok: boolean; error?: string }
    try {
      syntaxResult = await checkSyntax(next)
    } finally {
      setApplyChecking(false)
    }
    if (!syntaxResult.ok) {
      setApplyError(
        `선택한 영역을 적용하면 문법 오류가 발생합니다 (적용 취소됨):\n${syntaxResult.error}\n` +
          `영역이 Lua 블록(function/if/for/do...end) 경계와 맞지 않을 수 있습니다. 영역을 다시 선택하거나 다시 요청해보세요.`,
      )
      return
    }

    setLastAppliedSnapshot(snapshot)
    setSource(next)
    setPhase({ kind: 'idle' })
    setPostCheck(null)
    setChangeSummary(null)

    await Promise.all([summarizeChanges(snapshot, request, edits), recheckAfterApply(next)])
  }

  async function summarizeChanges(snapshot: string, request: string, edits: { region: EditRegion; newText: string }[]) {
    setSummaryLoading(true)
    try {
      const oldLines = snapshot.split('\n')
      const diffText = edits
        .map(({ region, newText }) => {
          const oldText = oldLines.slice(region.startLine - 1, region.endLine).join('\n')
          return (
            `영역 ${region.startLine}~${region.endLine} (${region.reason}):\n` +
            `--- 기존 ---\n${oldText}\n--- 수정 ---\n${newText}`
          )
        })
        .join('\n\n')
      const messages: ChatMessage[] = [
        { role: 'system', content: summarySystemPrompt() },
        { role: 'user', content: `사용자 요청: ${request}\n\n적용된 변경 내역:\n${diffText}` },
      ]
      const summary = await callDeepseek({
        apiKey: settings.apiKey,
        model: settings.model,
        maxOutputTokens: settings.maxOutputTokens,
        messages,
      })
      setChangeSummary(summary)
      setHistory((h) => [...h, { request, summary }])
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setChangeSummary(`(변경 요약 생성 실패: ${message})`)
      setHistory((h) => [...h, { request, summary: '(요약 생성 실패)' }])
    } finally {
      setSummaryLoading(false)
    }
  }

  async function recheckAfterApply(next: string) {
    setPostCheckRunning(true)
    try {
      setPostCheck(await runFullDiagnostics(next, marker))
    } finally {
      setPostCheckRunning(false)
    }
  }

  function requestFixFromDiagnostics() {
    if (!postCheck) return
    const failing = postCheck.filter((d) => !d.ok)
    if (failing.length === 0) return
    const text = `다음 오류를 수정해줘:\n${failing.map((d) => `[${d.stage}] ${d.error}`).join('\n')}`
    startPlanning(text)
  }

  function revert() {
    if (lastAppliedSnapshot === null) return
    setSource(lastAppliedSnapshot)
    setLastAppliedSnapshot(null)
    setPostCheck(null)
    setChangeSummary(null)
  }

  function toggleSelected(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function cancel() {
    setApplyError(null)
    setPhase({ kind: 'idle' })
  }

  const postCheckFailing = postCheck?.filter((d) => !d.ok) ?? []

  function handleSend() {
    if (phase.kind === 'discussing') continueDiscussion(input)
    else startPlanning()
  }

  return (
    <div className="region-edit-flow">
      {lastAppliedSnapshot !== null && phase.kind === 'idle' && (
        <div className="region-revert-bar">
          <span>방금 영역 수정이 적용되었습니다.</span>
          <button onClick={revert}>적용 전 코드로 되돌리기</button>
        </div>
      )}

      {(changeSummary || summaryLoading) && phase.kind === 'idle' && (
        <div className="region-summary-box">
          <div className="region-summary-header">변경 요약 (AI)</div>
          {summaryLoading ? <div className="ai-loading">요약 생성 중...</div> : <div className="region-summary-text">{changeSummary}</div>}
        </div>
      )}

      {(postCheck || postCheckRunning) && phase.kind === 'idle' && (
        <div className="region-postcheck-box">
          <div className="region-summary-header">적용 후 재점검</div>
          {postCheckRunning ? (
            <div className="ai-loading">재점검 중...</div>
          ) : (
            <>
              {postCheck!.map((d, i) => (
                <div key={i} className={d.ok ? 'diagnostics-item ok' : 'diagnostics-item fail'}>
                  <span className="diagnostics-stage">
                    {d.ok ? '✓' : '✗'} {d.stage}
                  </span>
                  {!d.ok && <pre>{d.error}</pre>}
                </div>
              ))}
              {postCheckFailing.length > 0 && (
                <button className="region-fix-btn" onClick={requestFixFromDiagnostics}>
                  발견된 오류로 다시 수정 요청
                </button>
              )}
            </>
          )}
        </div>
      )}

      {(phase.kind === 'idle' || phase.kind === 'error') && (
        <>
          {phase.kind === 'error' && <div className="ai-error">{phase.message}</div>}
          <p className="ai-empty-hint">
            자연어로 요청하면 ① AI가 요청을 어떻게 이해했는지 먼저 대화로 확인하고 ② 계획을
            확정하면 수정이 필요한 영역만 식별해 몇 군데인지 보여준 뒤 ③ 승인하면 영역별로
            호출해 수정하고 ④ 검토 후 적용합니다. 적용 후에는 자동으로 재점검하고 변경 요약을
            보여주며, 이전 작업 내역은 다음 요청에서 참고용으로 기억됩니다.
          </p>
        </>
      )}

      {phase.kind === 'discussing' && (
        <div className="region-discussion">
          {phase.messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'region-chat-msg user' : 'region-chat-msg assistant'}>
              <div className="region-chat-role">{m.role === 'user' ? '나' : 'AI'}</div>
              <div className="region-chat-text">{i === 0 && m.role === 'user' ? phase.request : m.content}</div>
            </div>
          ))}
          {discussLoading && <div className="ai-loading">AI가 이해한 내용을 정리하는 중...</div>}
          <div className="region-actions">
            <button onClick={confirmAndPlan} disabled={discussLoading || phase.messages.length === 0}>
              계획대로 진행 (영역 식별 시작)
            </button>
            <button className="region-actions-secondary" onClick={cancel}>
              취소
            </button>
          </div>
        </div>
      )}

      {phase.kind === 'planning' && <div className="ai-loading">수정할 영역을 식별하는 중...</div>}

      {phase.kind === 'awaiting-approval' && (
        <div className="region-approval">
          <p>
            <strong>{phase.regions.length}개 영역</strong>을 수정합니다 (영역별로 1번씩, 총{' '}
            <strong>{phase.regions.length}번</strong> 호출 예정). 진행 전 현재 코드는 저장되며,
            적용 후 문제가 있으면 되돌릴 수 있습니다.
          </p>
          <ul className="region-list">
            {phase.regions.map((r, i) => (
              <li key={i}>
                {r.startLine}~{r.endLine}번째 줄 — {r.reason}
              </li>
            ))}
          </ul>
          <div className="region-actions">
            <button onClick={() => approveAndEdit(phase.regions, phase.snapshot, phase.request)}>
              승인하고 진행
            </button>
            <button className="region-actions-secondary" onClick={cancel}>
              취소
            </button>
          </div>
        </div>
      )}

      {phase.kind === 'editing' && (
        <div className="ai-loading">{phase.regions.length}개 영역 수정 중... ({phase.drafts.length}건 호출)</div>
      )}

      {phase.kind === 'review' && (
        <div className="region-review">
          <p>검토 후 적용할 영역을 선택하세요.</p>
          {phase.drafts.map((d, i) => (
            <div key={i} className="region-draft">
              <label className="region-draft-header">
                <input
                  type="checkbox"
                  checked={selected.has(i)}
                  disabled={d.newText === null}
                  onChange={() => toggleSelected(i)}
                />
                {d.region.startLine}~{d.region.endLine}번째 줄 — {d.region.reason}
              </label>
              {d.error ? (
                <div className="ai-error">{d.error}</div>
              ) : (
                <pre className="region-draft-code">{d.newText}</pre>
              )}
            </div>
          ))}
          {applyError && <pre className="ai-error">{applyError}</pre>}
          <div className="region-actions">
            <button
              onClick={() => applySelected(phase.snapshot, phase.request, phase.drafts)}
              disabled={selected.size === 0 || applyChecking}
            >
              {applyChecking ? '문법 검증 중...' : '선택한 영역 적용'}
            </button>
            <button className="region-actions-secondary" onClick={cancel}>
              취소
            </button>
          </div>
        </div>
      )}

      {history.length > 0 && phase.kind === 'idle' && (
        <details className="region-history">
          <summary>이전 작업 내역 ({history.length}건, 다음 요청에 참고됨)</summary>
          <ol>
            {history.map((h, i) => (
              <li key={i}>
                <strong>{h.request}</strong>
                <div>{h.summary}</div>
              </li>
            ))}
          </ol>
        </details>
      )}

      <div className="ai-input-row">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend()
          }}
          placeholder={
            phase.kind === 'discussing'
              ? '이해가 맞는지 보정하거나 추가 설명을 입력하세요 (Ctrl+Enter로 전송)'
              : '수정 요청 입력 (Ctrl+Enter로 전송), 예: "선물 카운터가 1씩 오르게 해줘"'
          }
          disabled={phase.kind === 'planning' || phase.kind === 'editing' || discussLoading}
        />
        <button onClick={handleSend} disabled={phase.kind === 'planning' || phase.kind === 'editing' || discussLoading}>
          전송
        </button>
      </div>
    </div>
  )
}
