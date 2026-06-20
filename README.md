# RisuAI Lua 테스트 워크벤치

RisuAI 캐릭터 `.lua` 스크립트를 브라우저에서 직접 실행하고, 가상 16:9 화면에
패널 HTML을 렌더링하면서, Chrome 개발자도구처럼 UI 요소를 클릭해 해당 코드
위치로 점프할 수 있는 로컬 테스트 도구입니다. DeepSeek API를 이용한 "직접
수정" / "기능설명" AI 보조 기능도 포함합니다.

## 실행 방법

```bash
npm install
npm run dev
```

`npm install`을 하면 `postinstall` 스크립트가 wasmoon의 `glue.wasm`을
`public/`에 복사합니다 (오프라인 환경에서도 동작하도록 CDN 대신 로컬 파일을
사용). 브라우저에서 `http://localhost:5173`을 열면 됩니다.

## 구성

- **좌측 에디터**: Lua 소스 코드를 직접 수정합니다 (CodeMirror). 수정하면
  0.5초 디바운스 후 자동으로 다시 로드되어 패널이 갱신됩니다.
- **중앙 미리보기**: 16:9 화면에 `editDisplay` 핸들러가 반환한 HTML을
  렌더링합니다. 상단 컨트롤로 `onStart`/`onInput`/`onOutput`을 직접 트리거할
  수 있습니다. "요소 선택 모드"를 켜면 Chrome 개발자도구처럼 패널 안의 요소를
  클릭해 정보를 확인할 수 있고, "이 줄로 이동" 버튼으로 소스에서 근사 매칭되는
  줄로 점프합니다 (id → class → 텍스트 순으로 검색; Lua가 문자열로 HTML을
  만드는 구조상 완벽한 1:1 매핑은 불가능하므로 근사치입니다).
- **우측 상단**: state 덤프 (getState/setState로 저장된 값) 및 문법/런타임
  오류 표시.
- **우측 하단**: DeepSeek AI 패널. "Lua 직접 수정" 탭은 요청을 자연어로 입력하면
  전체 코드를 수정해서 돌려주고 "적용" 버튼으로 바로 반영합니다. "Lua 기능설명"
  탭은 코드 동작을 한국어로 설명해줍니다. 두 탭 모두 업로드된 RisuAI Lua 개발
  가이드를 시스템 프롬프트에 포함해 흔한 함정(한글 테이블 키, 마커 정확매칭,
  멱등성 등)을 따르도록 합니다.

## DeepSeek API 설정

우측 상단 ⚙ 버튼(또는 AI 패널의 ⚙)에서 API 키를 입력하면 브라우저
`localStorage`에만 저장됩니다. 요청은 Vite dev 서버의 `/api/deepseek` 프록시
(`vite.config.ts`)를 통해 `https://api.deepseek.com`으로 직접 전달되며, 별도
백엔드 서버에는 저장되지 않습니다. 모델/최대 출력 토큰은 기본적으로 각 모델의
최대치로 설정되어 있습니다.

## 동작 원리 (mock RisuAI API)

`src/lua/mockRisuApi.ts`는 RisuAI 런타임이 캐릭터 스크립트에 제공하는
`getState`/`setState`/`getChat`/`setChat`/`addChat`/`listenEdit` 등을 흉내내는
Lua 스텁이며, [wasmoon](https://github.com/ceifa/wasmoon) (브라우저용 Lua 5.4
WASM)으로 실행됩니다. 캐릭터 스크립트를 다시 로드해도 state/채팅 로그는 같은
엔진 인스턴스가 살아있는 동안 유지되어, RisuAI가 콜백마다 스크립트 전체를
재실행하는 실제 동작을 흉내냅니다.
