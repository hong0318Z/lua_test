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
