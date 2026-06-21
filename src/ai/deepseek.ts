import { RISU_LUA_DEV_GUIDE } from './devGuide'
import type { DeepseekModel } from '../state/store'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const EDIT_SYSTEM_PROMPT = `너는 RisuAI 캐릭터 Lua 스크립트를 직접 수정해주는 시니어 엔지니어다.
아래는 이 프로젝트에서 실제로 겪은 버그와 그 해결 원칙을 정리한 개발 가이드다.
모든 수정은 이 가이드의 원칙(특히 한글 테이블 키는 ["키"]=값, state는 getState/setState로만,
마커는 전체-일치, 멱등성, 중괄호 짝)을 위반하지 않아야 한다.

--- 개발 가이드 시작 ---
${RISU_LUA_DEV_GUIDE}
--- 개발 가이드 끝 ---

사용자가 현재 Lua 소스 전체와 요청사항을 줄 것이다. 규칙:
1. 응답은 반드시 수정된 "전체 .lua 파일 내용"을 \`\`\`lua 코드 블록 하나로만 제공한다 (그 외 설명은 코드 블록 밖에 짧게).
2. 요청과 무관한 부분은 최대한 원본 그대로 유지한다.
3. 가이드의 함정(한글 키, 마커 정확매칭+캐시버스팅, 멱등성 등)에 해당하는 변경을 할 때는 가이드 원칙을 따른다.
4. 문법적으로 luac -p를 통과할 수 있는 유효한 Lua 코드여야 한다 (중괄호/따옴표 짝 검증).`

const EXPLAIN_SYSTEM_PROMPT = `너는 RisuAI 캐릭터 Lua 스크립트를 분석해서 한국어로 설명해주는 코드 분석가다.
아래 개발 가이드에 정리된 흔한 함정들을 알고 있는 상태로, 사용자가 준 Lua 코드(전체 또는 일부)를 분석한다.

--- 개발 가이드 시작 ---
${RISU_LUA_DEV_GUIDE}
--- 개발 가이드 끝 ---

설명할 때 다음을 포함한다:
1. 이 코드가 하는 일(동작 요약)
2. 호출 시점/조건 (onStart/onInput/onOutput/editDisplay 중 어디서, 언제)
3. state에 어떤 키를 읽고/쓰는지
4. 가이드에 정리된 패턴(한글 키, 마커 정확매칭, 멱등성 등) 위반 가능성이나 잠재적 버그가 보이면 구체적으로 지적
5. 코드 수정은 하지 않는다 — 설명만 한다.`

export function systemPromptFor(tab: 'edit' | 'explain'): string {
  return tab === 'edit' ? EDIT_SYSTEM_PROMPT : EXPLAIN_SYSTEM_PROMPT
}

// ===== 영역 지정 → 분할 수정 흐름 (전체 파일을 매번 통짜로 재생성하지 않기 위함) =====

export interface EditRegion {
  startLine: number
  endLine: number
  reason: string
}

const PLAN_SYSTEM_PROMPT = `너는 RisuAI 캐릭터 Lua 스크립트의 수정이 필요한 영역(줄 범위)만 짚어내는 분석가다.
전체 파일을 다시 쓰지 않는다. 사용자의 요청을 처리하는 데 실제로 코드를 바꿔야 하는
최소한의 줄 범위만 식별한다. 줄 번호는 입력으로 주어지는 "N: 코드" 형식의 N을 그대로 쓴다.

규칙:
1. 응답은 다른 설명 없이 JSON 배열 하나만 \`\`\`json 코드 블록으로 출력한다.
2. 각 원소는 {"startLine": number, "endLine": number, "reason": string} 형태다.
3. 서로 겹치지 않는, 가능한 한 적고 좁은 범위로 나눈다 (관련 없는 줄은 포함하지 않음).
4. 요청을 처리하기 위해 새 코드를 "추가"해야 한다면 가장 적절한 삽입 위치 바로 다음 줄 하나를 startLine=endLine으로 지정하고 reason에 "추가"라고 명시한다.
5. 수정이 필요한 영역이 전혀 없다고 판단되면 빈 배열 []을 반환한다.
6. 매우 중요: 각 영역은 반드시 Lua 블록 경계에 맞춰 끊어야 한다. 즉 startLine과 endLine 사이에서
   여는 키워드(function/if/for/while/do 등)와 그것을 닫는 end가 항상 영역 "안에서" 쌍으로 완결되어야
   하며, 영역이 블록의 중간(예: if는 포함하지만 그 end는 영역 밖에 있는 경우)에서 끊기면 절대 안 된다.
   영역의 시작/끝 줄을 한 단계 넓혀서라도 블록이 항상 완전한 형태로 포함되도록 한다.`

const EDIT_REGION_SYSTEM_PROMPT = `너는 RisuAI 캐릭터 Lua 스크립트의 한 영역만 수정하는 엔지니어다.
아래는 이 프로젝트의 개발 가이드다. 모든 수정은 이 가이드의 원칙을 위반하지 않아야 한다.

--- 개발 가이드 시작 ---
${RISU_LUA_DEV_GUIDE}
--- 개발 가이드 끝 ---

사용자가 전체 요청, 이 영역을 골라낸 이유, 그리고 줄 번호가 매겨진 주변 컨텍스트(대상 영역 포함)를
줄 것이다. 규칙:
1. 응답은 반드시 "대상 영역(startLine~endLine)을 대체할 코드"만 \`\`\`lua 코드 블록 하나로 제공한다. 줄 번호 표시는 포함하지 않는다.
2. 컨텍스트로 받은 줄 중 startLine~endLine 범위 밖의 줄은 그대로 참고만 하고 절대 다시 출력하지 않는다.
3. 들여쓰기와 문맥(들어가는 블록의 깊이, 주변 함수)을 보고 자연스럽게 이어지도록 작성한다.
4. 가이드의 함정(한글 키, 마커 정확매칭+캐시버스팅, 멱등성 등)을 따른다.
5. 문법적으로 유효한 Lua 코드 조각이어야 한다.
6. 매우 중요: 대상 영역 안에서 여는 키워드(function/if/for/while/do 등)와 닫는 end의 개수가
   정확히 맞아야 한다. 컨텍스트에서 영역 밖에 있던 end나 then/do를 영역 안으로 끌어오거나,
   영역 안에 있던 end를 빼먹는 등으로 전체 파일의 블록 짝이 깨지면 절대 안 된다. 대체 코드를
   작성한 뒤 직접 괄호/end 짝을 세어 확인한다.`

export function numberLines(source: string): string {
  return source
    .split('\n')
    .map((line, i) => `${i + 1}: ${line}`)
    .join('\n')
}

export function planSystemPrompt(): string {
  return PLAN_SYSTEM_PROMPT
}

export function editRegionSystemPrompt(): string {
  return EDIT_REGION_SYSTEM_PROMPT
}

export interface EditHistoryEntry {
  request: string
  summary: string
}

// 이전 작업 내역을 플래너에게 참고용으로 전달하기 위한 압축된 텍스트.
// 매번 전체 diff를 다시 보내지 않고, 요청 + 변경 요약만 누적해서 "기억"하게 한다.
export function buildHistoryContext(history: EditHistoryEntry[]): string {
  if (history.length === 0) return ''
  const lines = history.map((h, i) => `${i + 1}. 요청: ${h.request}\n   적용된 변경 요약: ${h.summary}`)
  return `이전 작업 내역 (이미 적용되어 현재 소스에 반영된 상태다, 참고만 할 것):\n${lines.join('\n')}\n\n`
}

const SUMMARY_SYSTEM_PROMPT = `너는 방금 적용된 Lua 코드 변경 사항을 한국어로 간결하게 정리하는 어시스턴트다.
사용자 요청과, 영역별로 무엇이 어떻게 바뀌었는지(기존 코드 vs 수정된 코드)가 주어진다.
규칙:
1. 코드를 다시 출력하지 않는다. 변경 내용을 사람이 읽을 수 있는 설명으로만 정리한다.
2. 각 영역이 "무엇을 왜" 바꿨는지 짧은 불릿 포인트로 정리한다.
3. 전체 분량은 5줄 이내로 간결하게 유지한다.`

export function summarySystemPrompt(): string {
  return SUMMARY_SYSTEM_PROMPT
}

// 플래너 응답에서 JSON 배열을 추출한다 (```json 블록 우선, 없으면 첫 '[' ~ 마지막 ']').
export function parseEditRegions(text: string): EditRegion[] {
  const blockMatch = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/)
  const jsonText = blockMatch ? blockMatch[1] : text
  const start = jsonText.indexOf('[')
  const end = jsonText.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('영역 식별 응답에서 JSON 배열을 찾지 못했습니다.')
  }
  const parsed = JSON.parse(jsonText.slice(start, end + 1))
  if (!Array.isArray(parsed)) throw new Error('영역 식별 응답이 배열 형식이 아닙니다.')
  return parsed.map((r) => ({
    startLine: Number(r.startLine),
    endLine: Number(r.endLine),
    reason: String(r.reason ?? ''),
  }))
}

// 영역 수정 응답에서 코드 블록(대상 영역 대체 코드)을 추출한다.
export function extractRegionReplacement(text: string): string {
  const code = extractLuaCodeBlock(text)
  if (code === null) throw new Error('영역 수정 응답에서 코드 블록을 찾지 못했습니다.')
  return code
}

const CONTEXT_PADDING_LINES = 8

export function buildRegionContext(source: string, region: EditRegion): { contextText: string; contextStart: number; contextEnd: number } {
  const lines = source.split('\n')
  const contextStart = Math.max(1, region.startLine - CONTEXT_PADDING_LINES)
  const contextEnd = Math.min(lines.length, region.endLine + CONTEXT_PADDING_LINES)
  const contextText = lines
    .slice(contextStart - 1, contextEnd)
    .map((line, i) => `${contextStart + i}: ${line}`)
    .join('\n')
  return { contextText, contextStart, contextEnd }
}

// 줄 번호 기준으로 영역들을 대체 텍스트로 치환한다. 뒤쪽(아래) 영역부터 적용해야
// 앞쪽 영역의 줄 번호가 그대로 유지된다.
export function applyRegionEdits(source: string, edits: { region: EditRegion; newText: string }[]): string {
  const lines = source.split('\n')
  const sorted = [...edits].sort((a, b) => b.region.startLine - a.region.startLine)
  for (const { region, newText } of sorted) {
    const replacement = newText.split('\n')
    lines.splice(region.startLine - 1, region.endLine - region.startLine + 1, ...replacement)
  }
  return lines.join('\n')
}

export interface DeepseekCallOptions {
  apiKey: string
  model: DeepseekModel
  maxOutputTokens: number
  messages: ChatMessage[]
  signal?: AbortSignal
}

export async function callDeepseek({ apiKey, model, maxOutputTokens, messages, signal }: DeepseekCallOptions): Promise<string> {
  if (!apiKey) throw new Error('DeepSeek API 키가 설정되지 않았습니다. 설정에서 입력해주세요.')

  const res = await fetch('/api/deepseek/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxOutputTokens,
      stream: false,
    }),
    signal,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`DeepSeek API 오류 (${res.status}): ${body.slice(0, 500)}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('DeepSeek 응답 형식이 예상과 다릅니다.')
  return content
}

// 응답 중 ```lua ... ``` 코드 블록 하나를 추출한다 (직접수정 탭에서 적용용).
export function extractLuaCodeBlock(text: string): string | null {
  const match = text.match(/```lua\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/)
  return match ? match[1].trim() : null
}
