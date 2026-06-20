import { useState } from 'react'
import { useAppStore } from '../state/store'

interface Props {
  onNewChat: () => void
  onUserMessage: (text: string) => void
  onCharMessage: (text: string) => void
  onRefreshPanel: () => void
  busy: boolean
}

export function ControlBar({ onNewChat, onUserMessage, onCharMessage, onRefreshPanel, busy }: Props) {
  const marker = useAppStore((s) => s.marker)
  const setMarker = useAppStore((s) => s.setMarker)
  const [userText, setUserText] = useState('')
  const [charText, setCharText] = useState('')

  return (
    <div className="control-bar">
      <div className="control-row">
        <button onClick={onNewChat} disabled={busy}>
          새 채팅 시작 (onStart)
        </button>
        <button onClick={onRefreshPanel} disabled={busy}>
          패널 새로고침 (editDisplay)
        </button>
        <label className="marker-field">
          <span>패널 마커</span>
          <input value={marker} onChange={(e) => setMarker(e.target.value)} />
        </label>
      </div>
      <div className="control-row">
        <input
          className="msg-input"
          placeholder="유저 메시지 (onInput 트리거)"
          value={userText}
          onChange={(e) => setUserText(e.target.value)}
        />
        <button
          disabled={busy}
          onClick={() => {
            onUserMessage(userText)
            setUserText('')
          }}
        >
          전송
        </button>
      </div>
      <div className="control-row">
        <input
          className="msg-input"
          placeholder="AI 응답 메시지 (onOutput 트리거, 커맨드 포함 가능)"
          value={charText}
          onChange={(e) => setCharText(e.target.value)}
        />
        <button
          disabled={busy}
          onClick={() => {
            onCharMessage(charText)
            setCharText('')
          }}
        >
          전송
        </button>
      </div>
    </div>
  )
}
