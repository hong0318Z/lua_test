import { useAppStore } from '../state/store'
import { findApproximateLine } from '../lua/elementMapper'

interface Props {
  onJump: (line: number) => void
}

export function Inspector({ onJump }: Props) {
  const selected = useAppStore((s) => s.selected)
  const source = useAppStore((s) => s.source)

  if (!selected) {
    return (
      <div className="inspector inspector-empty">
        <p>패널에서 "요소 선택 모드"를 켜고 UI를 클릭하면 여기에 정보가 표시됩니다.</p>
      </div>
    )
  }

  const line = findApproximateLine(source, selected)

  return (
    <div className="inspector">
      <div className="inspector-row">
        <span className="inspector-key">태그</span>
        <code>{selected.tag}</code>
      </div>
      {selected.id && (
        <div className="inspector-row">
          <span className="inspector-key">id</span>
          <code>{selected.id}</code>
        </div>
      )}
      {selected.classes.length > 0 && (
        <div className="inspector-row">
          <span className="inspector-key">class</span>
          <code>{selected.classes.join(' ')}</code>
        </div>
      )}
      <div className="inspector-row">
        <span className="inspector-key">텍스트</span>
        <code>{selected.textSample || '(없음)'}</code>
      </div>
      <div className="inspector-html">
        <span className="inspector-key">outerHTML</span>
        <pre>{selected.outerHtmlSnippet}</pre>
      </div>
      <div className="inspector-actions">
        {line ? (
          <button onClick={() => onJump(line)}>이 줄로 이동 (#{line}) — 근사 매핑</button>
        ) : (
          <span className="inspector-no-match">소스에서 매칭되는 위치를 찾지 못했습니다 (동적 생성/공백 차이 가능성).</span>
        )}
      </div>
    </div>
  )
}
