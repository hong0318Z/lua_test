// wasmoon은 브라우저에서 기본적으로 unpkg.com CDN의 glue.wasm을 가져오려
// 하는데, 오프라인/방화벽 환경에서 깨지므로 public/glue.wasm으로 로컬
// 사본을 둔다. npm install 때마다(postinstall) 최신 버전으로 다시 맞춘다.
import { copyFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const src = join(root, 'node_modules/wasmoon/dist/glue.wasm')
const dest = join(root, 'public/glue.wasm')

if (existsSync(src)) {
  copyFileSync(src, dest)
  console.log('glue.wasm copied to public/')
} else {
  console.warn('wasmoon glue.wasm not found, skipping copy')
}
