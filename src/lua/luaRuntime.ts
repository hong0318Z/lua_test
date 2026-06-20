import { LuaFactory } from 'wasmoon'
import type { LuaEngine } from 'wasmoon'
import { MOCK_RISU_API_LUA } from './mockRisuApi'

export const TEST_CHAT_ID = 'test-chat-1'

export type RunResult = { ok: true } | { ok: false; error: string }

// RisuAI 실기기는 콜백마다 스크립트 전체를 다시 실행하는 것에 가깝게 동작한다
// (가이드 PART 1-1). 이 클래스는 그 특성을 그대로 흉내낸다: doString으로
// 캐릭터 스크립트를 다시 로드해도 STATE/CHATLOG(mock_risu_api.lua 안의
// 클로저)는 같은 엔진 인스턴스가 살아있는 동안 유지된다.
// wasmoon은 브라우저에서 기본적으로 unpkg.com CDN에서 glue.wasm을 받아오려
// 한다. 오프라인/방화벽 환경에서도 동작하도록 public/glue.wasm으로 로컬에
// 같이 배포해서 직접 가리킨다.
const LOCAL_WASM_URI = `${import.meta.env.BASE_URL}glue.wasm`

export class LuaRuntime {
  private factory = new LuaFactory(LOCAL_WASM_URI)
  private lua: LuaEngine | null = null
  private ready: Promise<void> | null = null

  private async ensureReady() {
    if (!this.ready) {
      this.ready = (async () => {
        this.lua = await this.factory.createEngine()
        await this.lua.doString(MOCK_RISU_API_LUA)
      })()
    }
    return this.ready
  }

  async loadScript(source: string): Promise<RunResult> {
    await this.ensureReady()
    try {
      await this.lua!.doString(source)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: formatLuaError(e) }
    }
  }

  private async callGlobal<T = unknown>(name: string, ...args: unknown[]): Promise<T | undefined> {
    if (!this.lua) return undefined
    const fn = this.lua.global.get(name)
    if (typeof fn !== 'function') return undefined
    return (await fn(...args)) as T
  }

  async onStart(): Promise<RunResult> {
    try {
      await this.callGlobal('onStart', TEST_CHAT_ID)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: formatLuaError(e) }
    }
  }

  async onInput(): Promise<RunResult> {
    try {
      await this.callGlobal('onInput', TEST_CHAT_ID)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: formatLuaError(e) }
    }
  }

  async onOutput(): Promise<RunResult> {
    try {
      await this.callGlobal('onOutput', TEST_CHAT_ID)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: formatLuaError(e) }
    }
  }

  async addUserMessage(text: string) {
    await this.callGlobal('__mock_addUserMessage', TEST_CHAT_ID, text)
  }

  async addCharMessage(text: string) {
    await this.callGlobal('__mock_addCharMessage', TEST_CHAT_ID, text)
  }

  async triggerEdit(marker: string): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
    try {
      const has = await this.callGlobal<boolean>('__mock_hasHandler', 'editDisplay')
      if (!has) return { ok: false, error: "listenEdit('editDisplay', ...) 핸들러가 등록되지 않았습니다." }
      const html = await this.callGlobal<string>('__mock_triggerEdit', 'editDisplay', TEST_CHAT_ID, marker)
      return { ok: true, html: html ?? '' }
    } catch (e) {
      return { ok: false, error: formatLuaError(e) }
    }
  }

  async dumpState(): Promise<Record<string, unknown>> {
    const json = await this.callGlobal<string>('__mock_dumpStateJSON', TEST_CHAT_ID)
    try {
      return JSON.parse(json || '{}')
    } catch {
      return {}
    }
  }

  async dumpChat(): Promise<unknown[]> {
    const json = await this.callGlobal<string>('__mock_dumpChatJSON', TEST_CHAT_ID)
    try {
      const parsed = JSON.parse(json || '{}')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  async resetAll() {
    await this.callGlobal('__mock_resetAll')
  }
}

function formatLuaError(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
