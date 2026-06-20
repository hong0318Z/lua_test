import { useEffect, useRef } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { StreamLanguage } from '@codemirror/language'
import { lua } from '@codemirror/legacy-modes/mode/lua'
import { EditorView } from '@codemirror/view'
import { useAppStore } from '../state/store'

const luaLang = StreamLanguage.define(lua)

interface Props {
  jumpToLine: number | null
}

export function LuaEditor({ jumpToLine }: Props) {
  const source = useAppStore((s) => s.source)
  const setSource = useAppStore((s) => s.setSource)
  const ref = useRef<ReactCodeMirrorRef>(null)

  useEffect(() => {
    if (jumpToLine == null) return
    const view = ref.current?.view
    if (!view) return
    const lineCount = view.state.doc.lines
    const line = view.state.doc.line(Math.min(Math.max(jumpToLine, 1), lineCount))
    view.dispatch({
      selection: { anchor: line.from, head: line.to },
      effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
    })
    view.focus()
  }, [jumpToLine])

  return (
    <CodeMirror
      ref={ref}
      value={source}
      height="100%"
      theme="dark"
      extensions={[luaLang]}
      onChange={(value) => setSource(value)}
      basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
      style={{ height: '100%', fontSize: 13 }}
    />
  )
}
