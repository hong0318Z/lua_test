import type { SelectedElement } from '../state/store'

// 선택된 DOM 요소 정보로 Lua 소스 안에서 "가장 그럴듯한" 위치를 찾는다.
// Lua가 문자열로 HTML을 만드는 구조상 완벽한 1:1 매핑은 불가능하므로,
// id -> class -> 텍스트 샘플 순으로 소스 내 첫 등장 위치를 근사 매핑한다.
export function findApproximateLine(source: string, el: SelectedElement): number | null {
  const candidates: string[] = []
  if (el.id) candidates.push(el.id)
  candidates.push(...el.classes)
  if (el.textSample.trim().length >= 3) candidates.push(el.textSample.trim().slice(0, 24))

  for (const needle of candidates) {
    if (!needle) continue
    const idx = source.indexOf(needle)
    if (idx !== -1) {
      return source.slice(0, idx).split('\n').length
    }
  }
  return null
}
