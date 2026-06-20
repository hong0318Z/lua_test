import { useState } from 'react'
import { diffLines } from 'diff'
import { useAppStore } from '../state/store'
import { callDeepseek, extractLuaCodeBlock, systemPromptFor, type ChatMessage } from '../ai/deepseek'

interface Turn {
  role: 'user' | 'assistant'
  content: string
  extractedCode?: string | null
}

export function AiPanel() {
  const activeTab = useAppStore((s) => s.activeAiTab)
  const setActiveTab = useAppStore((s) => s.setActiveAiTab)
  const settings = useAppStore((s) => s.settings)
  const source = useAppStore((s) => s.source)
  const setSource = useAppStore((s) => s.setSource)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)

  const [editTurns, setEditTurns] = useState<Turn[]>([])
  const [explainTurns, setExplainTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const turns = activeTab === 'edit' ? editTurns : explainTurns
  const setTurns = activeTab === 'edit' ? setEditTurns : setExplainTurns

  async function send() {
    if (!input.trim() || loading) return
    if (!settings.apiKey) {
      setError('DeepSeek API 키가 설정되지 않았습니다.')
      setSettingsOpen(true)
      return
    }
    setError(null)
    const userPrompt =
      activeTab === 'edit'
        ? `현재 Lua 소스 전체:\n\`\`\`lua\n${source}\n\`\`\`\n\n요청: ${input}`
        : `Lua 소스:\n\`\`\`lua\n${source}\n\`\`\`\n\n질문: ${input}`

    const nextTurns: Turn[] = [...turns, { role: 'user', content: input }]
    setTurns(nextTurns)
    setInput('')
    setLoading(true)
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPromptFor(activeTab) },
        ...nextTurns.map((t) => ({ role: t.role, content: t.content }) as ChatMessage).slice(0, -1),
        { role: 'user', content: userPrompt },
      ]
      const reply = await callDeepseek({
        apiKey: settings.apiKey,
        model: settings.model,
        maxOutputTokens: settings.maxOutputTokens,
        messages,
      })
      const code = activeTab === 'edit' ? extractLuaCodeBlock(reply) : null
      setTurns([...nextTurns, { role: 'assistant', content: reply, extractedCode: code }])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  function applyCode(code: string) {
    setSource(code)
  }

  function diffSummary(code: string): string {
    const parts = diffLines(source, code)
    const added = parts.filter((p) => p.added).reduce((n, p) => n + (p.count ?? 0), 0)
    const removed = parts.filter((p) => p.removed).reduce((n, p) => n + (p.count ?? 0), 0)
    return `+${added} / -${removed} 줄`
  }

  return (
    <div className="ai-panel">
      <div className="ai-tabs">
        <button className={activeTab === 'edit' ? 'ai-tab active' : 'ai-tab'} onClick={() => setActiveTab('edit')}>
          Lua 직접 수정
        </button>
        <button className={activeTab === 'explain' ? 'ai-tab active' : 'ai-tab'} onClick={() => setActiveTab('explain')}>
          Lua 기능설명
        </button>
        <button className="ai-settings-btn" onClick={() => setSettingsOpen(true)} title="DeepSeek 설정">
          ⚙
        </button>
      </div>

      <div className="ai-turns">
        {turns.length === 0 && (
          <p className="ai-empty-hint">
            {activeTab === 'edit'
              ? '예: "선물 카운터가 1씩 오르게 해줘" 처럼 자연어로 요청하면 전체 코드를 수정해서 돌려줍니다.'
              : '예: "이 스크립트가 패널을 언제 다시 그리는지 설명해줘" 처럼 질문하세요.'}
          </p>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`ai-turn ai-turn-${t.role}`}>
            <div className="ai-turn-role">{t.role === 'user' ? '나' : 'DeepSeek'}</div>
            <div className="ai-turn-content">{t.content}</div>
            {t.extractedCode && (
              <div className="ai-turn-apply">
                <span>{diffSummary(t.extractedCode)}</span>
                <button onClick={() => applyCode(t.extractedCode!)}>이 코드로 적용</button>
              </div>
            )}
          </div>
        ))}
        {loading && <div className="ai-loading">DeepSeek 응답 대기 중...</div>}
        {error && <div className="ai-error">{error}</div>}
      </div>

      <div className="ai-input-row">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
          }}
          placeholder={activeTab === 'edit' ? '수정 요청 입력 (Ctrl+Enter로 전송)' : '질문 입력 (Ctrl+Enter로 전송)'}
        />
        <button onClick={send} disabled={loading}>
          전송
        </button>
      </div>
    </div>
  )
}
