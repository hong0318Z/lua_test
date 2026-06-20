import { DEEPSEEK_MODELS, MAX_CONTEXT_TOKENS, MAX_OUTPUT_TOKENS, type DeepseekModel, useAppStore } from '../state/store'

export function SettingsModal() {
  const open = useAppStore((s) => s.settingsOpen)
  const setOpen = useAppStore((s) => s.setSettingsOpen)
  const settings = useAppStore((s) => s.settings)
  const setSettings = useAppStore((s) => s.setSettings)

  if (!open) return null

  function onModelChange(model: DeepseekModel) {
    setSettings({ model, maxOutputTokens: MAX_OUTPUT_TOKENS[model] })
  }

  return (
    <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>DeepSeek API 설정</h3>

        <label className="field">
          <span>API 키</span>
          <input
            type="password"
            placeholder="sk-..."
            value={settings.apiKey}
            onChange={(e) => setSettings({ apiKey: e.target.value })}
          />
          <small>브라우저 localStorage에만 저장됩니다. 요청은 로컬 Vite dev 서버 프록시(/api/deepseek)를 통해 DeepSeek로 직접 전달되며 서버에는 저장되지 않습니다.</small>
        </label>

        <label className="field">
          <span>모델</span>
          <select value={settings.model} onChange={(e) => onModelChange(e.target.value as DeepseekModel)}>
            {DEEPSEEK_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>최대 출력 토큰</span>
          <input
            type="number"
            min={1}
            max={MAX_OUTPUT_TOKENS[settings.model]}
            value={settings.maxOutputTokens}
            onChange={(e) =>
              setSettings({ maxOutputTokens: Math.min(Number(e.target.value) || 1, MAX_OUTPUT_TOKENS[settings.model]) })
            }
          />
          <small>
            이 모델의 최대값: {MAX_OUTPUT_TOKENS[settings.model].toLocaleString()} (기본값으로 최대치가 설정되어 있습니다)
          </small>
        </label>

        <p className="modal-note">컨텍스트 윈도우: 약 {MAX_CONTEXT_TOKENS.toLocaleString()} 토큰 (모델 고정값, API가 자동 처리)</p>

        <div className="modal-actions">
          <button onClick={() => setOpen(false)}>닫기</button>
        </div>
      </div>
    </div>
  )
}
