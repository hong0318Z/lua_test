import { useState } from 'react'
import { useAppStore } from '../state/store'
import { callDeepseek, systemPromptFor, type ChatMessage } from '../ai/deepseek'
import { RegionEditFlow } from './RegionEditFlow'

interface Turn {
  role: 'user' | 'assistant'
  content: string
}

export function AiPanel() {
  const activeTab = useAppStore((s) => s.activeAiTab)
  const setActiveTab = useAppStore((s) => s.setActiveAiTab)
  const settings = useAppStore((s) => s.settings)
  const source = useAppStore((s) => s.source)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)

  const [explainTurns, setExplainTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendExplain() {
    if (!input.trim() || loading) return
    if (!settings.apiKey) {
      setError('DeepSeek API 키가 설정되지 않았습니다.')
      setSettingsOpen(true)
      return
    }
    setError(null)
    const userPrompt = `Lua 소스:\n\`\`\`lua\n${source}\n\`\`\`\n\n질문: ${input}`

    const nextTurns: Turn[] = [...explainTurns, { role: 'user', content: input }]
    setExplainTurns(nextTurns)
    setInput('')
    setLoading(true)
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPromptFor('explain') },
        ...nextTurns.map((t) => ({ role: t.role, content: t.content }) as ChatMessage).slice(0, -1),
        { role: 'user', content: userPrompt },
      ]
      const reply = await callDeepseek({
        apiKey: settings.apiKey,
        model: settings.model,
        maxOutputTokens: settings.maxOutputTokens,
        messages,
      })
      setExplainTurns([...nextTurns, { role: 'assistant', content: reply }])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
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

      {activeTab === 'edit' ? (
        <RegionEditFlow />
      ) : (
        <>
          <div className="ai-turns">
            {explainTurns.length === 0 && (
              <p className="ai-empty-hint">
                예: "이 스크립트가 패널을 언제 다시 그리는지 설명해줘" 처럼 질문하세요.
              </p>
            )}
            {explainTurns.map((t, i) => (
              <div key={i} className={`ai-turn ai-turn-${t.role}`}>
                <div className="ai-turn-role">{t.role === 'user' ? '나' : 'DeepSeek'}</div>
                <div className="ai-turn-content">{t.content}</div>
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
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendExplain()
              }}
              placeholder="질문 입력 (Ctrl+Enter로 전송)"
            />
            <button onClick={sendExplain} disabled={loading}>
              전송
            </button>
          </div>
        </>
      )}
    </div>
  )
}
