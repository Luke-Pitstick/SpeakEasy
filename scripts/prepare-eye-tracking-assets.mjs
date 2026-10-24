// Copies the MediaPipe WASM runtime out of node_modules and downloads the face landmarker
// model into the renderer's public folder, so eye tracking works fully offline at runtime.
import { existsSync } from 'node:fs'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'src/renderer/public/mediapipe')
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const wasmFiles = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm'
]
const modelUrl =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const modelPath = join(outDir, 'face_landmarker.task')

await mkdir(join(outDir, 'wasm'), { recursive: true })
for (const file of wasmFiles) {
  await copyFile(join(wasmSrc, file), join(outDir, 'wasm', file))
}

if (!existsSync(modelPath)) {
  console.log(`Downloading face landmarker model from ${modelUrl}`)
  const res = await fetch(modelUrl)
  if (!res.ok) throw new Error(`Model download failed: ${res.status} ${res.statusText}`)
  await writeFile(modelPath, Buffer.from(await res.arrayBuffer()))
}

console.log('Eye tracking assets ready in src/renderer/public/mediapipe')
