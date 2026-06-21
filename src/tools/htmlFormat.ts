// 들여쓰기만 다시 계산하는 단순 HTML 포매터.
// 텍스트 콘텐츠 내부의 공백/줄바꿈은 의미 있는 내용으로 간주하고 그대로 보존하며,
// 태그를 새 줄/들여쓰기로 재배치하는 것만 담당한다.

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

// 내부를 그대로 보존해야 하는 태그 (포맷팅 대상에서 제외)
const RAW_TAGS = new Set(['pre', 'script', 'style', 'textarea'])

type Node =
  | { type: 'element'; tag: string; attrs: string; selfClose: boolean; children: Node[]; raw?: string }
  | { type: 'text'; value: string }
  | { type: 'comment'; value: string }

function tokenizeAndParse(html: string): Node[] {
  let i = 0
  const n = html.length

  function parseChildren(stopTag: string | null): Node[] {
    const nodes: Node[] = []
    while (i < n) {
      if (stopTag && html.startsWith(`</${stopTag}`, i)) break
      if (html.startsWith('<!--', i)) {
        const end = html.indexOf('-->', i + 4)
        const close = end === -1 ? n : end + 3
        nodes.push({ type: 'comment', value: html.slice(i, close) })
        i = close
        continue
      }
      if (html[i] === '<') {
        const isClose = html[i + 1] === '/'
        if (isClose) {
          // 닫는 태그인데 stopTag와 매칭되지 않으면(구조 깨짐) 그냥 건너뛴다
          const end = html.indexOf('>', i)
          i = end === -1 ? n : end + 1
          break
        }
        const tagMatch = /^<([a-zA-Z][a-zA-Z0-9:-]*)/.exec(html.slice(i))
        if (!tagMatch) {
          // '<' 로 시작하지만 태그가 아니면 텍스트로 취급
          nodes.push({ type: 'text', value: '<' })
          i += 1
          continue
        }
        const tag = tagMatch[1]
        const tagLower = tag.toLowerCase()
        const gt = html.indexOf('>', i)
        const tagEnd = gt === -1 ? n : gt
        const fullOpen = html.slice(i, tagEnd + 1)
        const selfClose = /\/>\s*$/.test(fullOpen) || VOID_TAGS.has(tagLower)
        const attrs = fullOpen
          .slice(tag.length + 1, fullOpen.endsWith('/>') ? -2 : -1)
          .trim()
        i = tagEnd + 1

        if (selfClose) {
          nodes.push({ type: 'element', tag: tagLower, attrs, selfClose: true, children: [] })
          continue
        }

        if (RAW_TAGS.has(tagLower)) {
          const closeTag = `</${tagLower}>`
          const closeIdx = html.toLowerCase().indexOf(closeTag, i)
          const rawContent = closeIdx === -1 ? html.slice(i) : html.slice(i, closeIdx)
          i = closeIdx === -1 ? n : closeIdx + closeTag.length
          nodes.push({ type: 'element', tag: tagLower, attrs, selfClose: false, children: [], raw: rawContent })
          continue
        }

        const children = parseChildren(tagLower)
        // 매칭되는 닫는 태그 소비
        if (html.startsWith(`</${tagLower}`, i)) {
          const closeGt = html.indexOf('>', i)
          i = closeGt === -1 ? n : closeGt + 1
        }
        nodes.push({ type: 'element', tag: tagLower, attrs, selfClose: false, children })
        continue
      }

      // 일반 텍스트
      const next = html.indexOf('<', i)
      const end = next === -1 ? n : next
      nodes.push({ type: 'text', value: html.slice(i, end) })
      i = end
    }
    return nodes
  }

  return parseChildren(null)
}

function hasElementChild(children: Node[]): boolean {
  return children.some((c) => c.type === 'element' || c.type === 'comment')
}

function render(nodes: Node[], depth: number, indent: string, lines: string[]) {
  const pad = indent.repeat(depth)
  for (const node of nodes) {
    if (node.type === 'comment') {
      lines.push(pad + node.value)
      continue
    }
    if (node.type === 'text') {
      const trimmed = node.value.trim()
      if (trimmed === '') continue
      lines.push(pad + node.value.trim())
      continue
    }
    // element
    const openTag = node.attrs ? `<${node.tag} ${node.attrs}>` : `<${node.tag}>`
    if (node.selfClose) {
      const tag = node.attrs ? `<${node.tag} ${node.attrs} />` : `<${node.tag} />`
      lines.push(pad + tag)
      continue
    }
    if (node.raw !== undefined) {
      lines.push(pad + openTag)
      // raw 내부는 공백/줄바꿈을 그대로 보존
      lines.push(node.raw.replace(/\n$/, ''))
      lines.push(pad + `</${node.tag}>`)
      continue
    }
    if (node.children.length === 0) {
      lines.push(pad + openTag + `</${node.tag}>`)
      continue
    }
    if (!hasElementChild(node.children)) {
      // 자식이 텍스트뿐이면 한 줄에 보존 (내부 공백을 건드리지 않음)
      const text = node.children.map((c) => (c.type === 'text' ? c.value : '')).join('')
      lines.push(pad + openTag + text + `</${node.tag}>`)
      continue
    }
    lines.push(pad + openTag)
    render(node.children, depth + 1, indent, lines)
    lines.push(pad + `</${node.tag}>`)
  }
}

export function formatHtml(html: string, indentSize: number): string {
  const indent = ' '.repeat(Math.max(0, indentSize))
  const nodes = tokenizeAndParse(html)
  const lines: string[] = []
  render(nodes, 0, indent, lines)
  return lines.join('\n')
}
