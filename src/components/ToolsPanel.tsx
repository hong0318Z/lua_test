import { useState } from 'react'
import { formatHtml } from '../tools/htmlFormat'
import {
  buildBlockInPattern,
  buildSingleLineInPattern,
  generateOptimizedRegex,
  type OptimizeMode,
} from '../tools/regexOptimizer'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="tools-copy-btn"
      onClick={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
    >
      {copied ? '복사됨!' : '복사'}
    </button>
  )
}

function HtmlFormatterSection() {
  const [input, setInput] = useState('')
  const [indentSize, setIndentSize] = useState(2)
  const [output, setOutput] = useState('')

  return (
    <div className="tools-section">
      <h3>HTML 포매터</h3>
      <p className="tools-hint">
        HTML을 붙여넣고 들여쓰기 크기를 정한 뒤 포맷하세요. div/span 등 콘텐츠 태그
        내부의 텍스트와 공백은 그대로 보존되고, 태그의 줄바꿈/들여쓰기만 다시
        정리됩니다.
      </p>
      <div className="tools-row">
        <label>
          들여쓰기 칸수
          <input
            type="number"
            min={1}
            max={8}
            value={indentSize}
            onChange={(e) => setIndentSize(Number(e.target.value) || 1)}
          />
        </label>
        <button onClick={() => setOutput(formatHtml(input, indentSize))}>포맷하기</button>
      </div>
      <div className="tools-grid">
        <div className="tools-col">
          <div className="tools-col-label">입력</div>
          <textarea
            className="tools-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="<div><span>...</span></div>"
          />
        </div>
        <div className="tools-col">
          <div className="tools-col-label">
            출력 {output && <CopyButton text={output} />}
          </div>
          <textarea className="tools-textarea" value={output} readOnly placeholder="포맷 결과" />
        </div>
      </div>
    </div>
  )
}

const MODE_LABELS: Record<OptimizeMode, string> = {
  'request-remove': '리퀘스트 제거 (새 정규식 추가)',
  'display-wrap-inplace': '디스플레이 수정 (기존 OUT을 감싸서 교체)',
  'display-remove-separate': '디스플레이 제거 (별도 정규식 추가)',
}

function RegexOptimizerSection() {
  const [mode, setMode] = useState<OptimizeMode>('request-remove')
  const [patternKind, setPatternKind] = useState<'block' | 'single' | 'custom'>('block')
  const [startTag, setStartTag] = useState('<Char_Status>')
  const [endTag, setEndTag] = useState('</Char_Status>')
  const [singleLiteral, setSingleLiteral] = useState('')
  const [customPattern, setCustomPattern] = useState('')
  const [keepLastN, setKeepLastN] = useState(5)
  const [result, setResult] = useState<{ type: string; inPattern: string; outTemplate: string } | null>(null)

  function buildInPattern(): string {
    if (patternKind === 'block') return buildBlockInPattern(startTag, endTag)
    if (patternKind === 'single') return buildSingleLineInPattern(singleLiteral)
    return customPattern
  }

  function generate() {
    const inPattern = buildInPattern()
    setResult(generateOptimizedRegex(mode, inPattern, keepLastN))
  }

  return (
    <div className="tools-section">
      <h3>정규식 최적화 (리퀘스트/디스플레이 제거)</h3>
      <p className="tools-hint">
        RisuAI 정규식(IN/OUT)에서, 지정한 패턴을 마지막 N개 메시지에서만 보이게
        감싸 토큰 사용량과 렌더링 지연을 줄입니다. AI 호출 없이 바로 생성됩니다.
      </p>

      <div className="tools-row">
        <label>
          모드
          <select value={mode} onChange={(e) => setMode(e.target.value as OptimizeMode)}>
            {Object.entries(MODE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          최근 유지 개수 (N)
          <input
            type="number"
            min={1}
            max={50}
            value={keepLastN}
            onChange={(e) => setKeepLastN(Number(e.target.value) || 1)}
          />
        </label>
      </div>

      <div className="tools-row">
        <label>
          패턴 종류
          <select value={patternKind} onChange={(e) => setPatternKind(e.target.value as typeof patternKind)}>
            <option value="block">시작/종료 태그 블록 (예: &lt;Char_Status&gt;...&lt;/Char_Status&gt;)</option>
            <option value="single">한 줄 리터럴 (예: 에셋/명령 토큰)</option>
            <option value="custom">직접 입력한 정규식</option>
          </select>
        </label>
      </div>

      {patternKind === 'block' && (
        <div className="tools-row">
          <label>
            시작 태그
            <input value={startTag} onChange={(e) => setStartTag(e.target.value)} />
          </label>
          <label>
            종료 태그
            <input value={endTag} onChange={(e) => setEndTag(e.target.value)} />
          </label>
        </div>
      )}
      {patternKind === 'single' && (
        <div className="tools-row">
          <label className="tools-row-grow">
            리터럴 텍스트
            <input value={singleLiteral} onChange={(e) => setSingleLiteral(e.target.value)} />
          </label>
        </div>
      )}
      {patternKind === 'custom' && (
        <div className="tools-row">
          <label className="tools-row-grow">
            정규식 (이미 기존 정규식의 IN 패턴이 있다면 그대로 붙여넣으세요)
            <input value={customPattern} onChange={(e) => setCustomPattern(e.target.value)} />
          </label>
        </div>
      )}

      <div className="tools-row">
        <button onClick={generate}>생성하기</button>
      </div>

      {result && (
        <div className="tools-result">
          <div className="tools-result-type">타입: {result.type}</div>
          <div className="tools-col-label">IN <CopyButton text={result.inPattern} /></div>
          <textarea className="tools-textarea tools-textarea-sm" value={result.inPattern} readOnly />
          <div className="tools-col-label">OUT <CopyButton text={result.outTemplate} /></div>
          <textarea className="tools-textarea tools-textarea-sm" value={result.outTemplate} readOnly />
        </div>
      )}
    </div>
  )
}

export function ToolsPanel() {
  return (
    <div className="tools-panel">
      <HtmlFormatterSection />
      <RegexOptimizerSection />
    </div>
  )
}
