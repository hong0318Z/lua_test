import { useEffect, useRef, useState } from 'react'
import type { SelectedElement } from '../state/store'

interface Props {
  html: string
  onSelect: (el: SelectedElement) => void
}

// 패널 iframe 안에 주입되는 스크립트. devtools처럼 hover 시 외곽선을
// 그리고, 클릭하면 부모 창에 요소 정보를 postMessage로 보낸다.
// pickerMode가 꺼져있을 땐 평범하게 클릭/탭 전환 등 실제 동작을 테스트할 수 있다.
const PICKER_SCRIPT = `
(function () {
  var pickerMode = false;
  var hoverEl = null;
  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'lua-devtools-set-picker-mode') {
      pickerMode = !!e.data.value;
      if (!pickerMode && hoverEl) { hoverEl.style.outline = ''; hoverEl = null; }
    }
  });
  document.addEventListener('mouseover', function (e) {
    if (!pickerMode) return;
    if (hoverEl) hoverEl.style.outline = '';
    hoverEl = e.target;
    hoverEl.style.outline = '2px solid #4da3ff';
    hoverEl.style.outlineOffset = '-1px';
  }, true);
  document.addEventListener('click', function (e) {
    if (!pickerMode) return;
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    var classes = el.className && typeof el.className === 'string' ? el.className.split(/\\s+/).filter(Boolean) : [];
    var info = {
      type: 'lua-devtools-select',
      tag: el.tagName ? el.tagName.toLowerCase() : '',
      id: el.id || null,
      classes: classes,
      outerHtmlSnippet: (el.outerHTML || '').slice(0, 300),
      textSample: (el.textContent || '').trim().slice(0, 60),
      selector: (el.tagName ? el.tagName.toLowerCase() : '') + (el.id ? '#' + el.id : '') + classes.map(function(c){return '.' + c}).join(''),
    };
    parent.postMessage(info, '*');
  }, true);
})();
`

function buildSrcDoc(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;width:100%;overflow:auto;}
    *{box-sizing:border-box;}
  </style></head><body>${html}<script>${PICKER_SCRIPT}</script></body></html>`
}

export function ScreenPreview({ html, onSelect }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [pickerMode, setPickerMode] = useState(false)

  useEffect(() => {
    function handler(e: MessageEvent) {
      if (e.data?.type === 'lua-devtools-select') {
        onSelect({
          selector: e.data.selector,
          tag: e.data.tag,
          id: e.data.id,
          classes: e.data.classes ?? [],
          outerHtmlSnippet: e.data.outerHtmlSnippet ?? '',
          textSample: e.data.textSample ?? '',
        })
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [onSelect])

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'lua-devtools-set-picker-mode', value: pickerMode }, '*')
  }, [pickerMode, html])

  return (
    <div className="screen-preview">
      <div className="screen-preview-toolbar">
        <span className="screen-preview-label">16:9 미리보기</span>
        <button className={pickerMode ? 'picker-btn active' : 'picker-btn'} onClick={() => setPickerMode((v) => !v)}>
          {pickerMode ? '🔍 요소 선택 모드 (끄기)' : '🔍 요소 선택 모드'}
        </button>
      </div>
      <div className="screen-16-9">
        <iframe
          ref={iframeRef}
          title="panel-preview"
          className="screen-16-9-frame"
          sandbox="allow-scripts"
          srcDoc={buildSrcDoc(html)}
        />
      </div>
    </div>
  )
}
