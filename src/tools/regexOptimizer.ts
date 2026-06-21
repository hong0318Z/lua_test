// RisuAI 정규식(IN/OUT) "리퀘스트 제거 & 디스플레이 제거" 최적화를
// AI 호출 없이 결정론적으로 생성하는 헬퍼.
//
// 기법 요약: OUT 템플릿을
//   {{#if {{greater_equal::{{chat_index}}::{{? {{lastmessageid}}-N}}}}}}
//   <원래 내용>
//   {{/if}}
// 로 감싸면, 마지막 N개 메시지에서만 내용이 보이고 그보다 오래된 메시지에서는
// 사라져서(=리퀘스트/디스플레이 제거) 토큰과 렌더링 부담을 줄인다.

export type OptimizeMode = 'request-remove' | 'display-wrap-inplace' | 'display-remove-separate'

export interface GeneratedRegex {
  type: string
  inPattern: string
  outTemplate: string
}

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildIfWrapper(content: string, keepLastN: number): string {
  return `{{#if {{greater_equal::{{chat_index}}::{{? {{lastmessageid}}-${keepLastN}}}}}}}\n${content}\n{{/if}}`
}

// 시작/종료 태그(예: <Char_Status> ... </Char_Status>)로 감싸인 블록을 매칭하는 IN 정규식 생성
export function buildBlockInPattern(startTag: string, endTag: string): string {
  return `${escapeRegexLiteral(startTag)}[\\s\\S]*?${escapeRegexLiteral(endTag)}`
}

// 한 줄 명령/에셋 패턴(예: {{asset:foo}} 같은 단일 토큰)을 매칭하는 IN 정규식 생성
export function buildSingleLineInPattern(literal: string): string {
  return escapeRegexLiteral(literal)
}

/**
 * mode별 IN/OUT 정규식 쌍을 생성한다.
 * - request-remove: 새 정규식을 추가해, 지정한 패턴을 마지막 N개 메시지에서만 보이게 한다 ("리퀘스트 제거")
 * - display-wrap-inplace: 기존 디스플레이 정규식의 OUT을 그대로 감싸서 타입을 "디스플레이 수정"으로 바꾼다
 * - display-remove-separate: 기존 디스플레이 정규식은 그대로 두고, 별도의 "디스플레이 제거" 전용 정규식을 추가한다
 */
export function generateOptimizedRegex(
  mode: OptimizeMode,
  inPattern: string,
  keepLastN: number,
): GeneratedRegex {
  const outTemplate = buildIfWrapper('$&', keepLastN)
  switch (mode) {
    case 'request-remove':
      return { type: '리퀘스트 제거 (신규 정규식)', inPattern, outTemplate }
    case 'display-wrap-inplace':
      return { type: '디스플레이 수정 (기존 정규식 OUT 교체)', inPattern, outTemplate }
    case 'display-remove-separate':
      return { type: '디스플레이 제거 (별도 정규식 추가)', inPattern, outTemplate }
  }
}
