import { FaceLandmarker, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import { removeBackground } from '@imgly/background-removal'
import type { BodyPartRegion, LandmarkPoint } from '../types'
import { buildContouredLayers } from './LayerBuilder'

export interface PersonAnalysis {
  cutoutUrl: string
  baseUrl: string
  sourceWidth: number
  sourceHeight: number
  personBounds: [number, number, number, number]
  layers: BodyPartRegion[]
  landmarks: LandmarkPoint[]
  method: string
  warnings: string[]
}

type Point = { x: number; y: number }

const LAYER_COLORS: Record<string, string> = {
  person: '#2ec4b6',
  head: '#5ad2ff',
  hair: '#9b8cff',
  eyeL: '#ffd166',
  eyeR: '#ffd166',
  mouth: '#ff6b8a',
  nose: '#f4a261',
  body: '#4cc9f0',
  clothes: '#48bfe3',
  armL: '#80ed99',
  armR: '#80ed99',
  legs: '#b8f2e6',
}

let faceLandmarker: FaceLandmarker | null = null
let poseLandmarker: PoseLandmarker | null = null
let visionReady: Promise<void> | null = null

async function ensureVision() {
  if (faceLandmarker && poseLandmarker) return
  if (!visionReady) {
    visionReady = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm',
      )
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        numFaces: 1,
      })
      poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'IMAGE',
        numPoses: 1,
      })
    })().catch(async () => {
      // GPU 失敗時改 CPU
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm',
      )
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        numFaces: 1,
      })
      poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        numPoses: 1,
      })
    })
  }
  await visionReady
}

function loadHtmlImage(src: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('圖片載入失敗'))
    img.src = typeof src === 'string' ? src : URL.createObjectURL(src)
  })
}

function canvasFromImage(img: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('無法建立畫布')
  ctx.drawImage(img, 0, 0)
  return { canvas, ctx }
}

/** 由 alpha 遮罩計算人物外接框（正規化） */
function boundsFromAlpha(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  alphaThreshold = 16,
): [number, number, number, number] | null {
  const { data } = ctx.getImageData(0, 0, w, h)
  let minX = w
  let minY = h
  let maxX = 0
  let maxY = 0
  let found = false
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const a = data[(y * w + x) * 4 + 3]
      if (a > alphaThreshold) {
        found = true
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  if (!found) return null
  const padX = (maxX - minX) * 0.02
  const padY = (maxY - minY) * 0.02
  const x0 = clamp((minX - padX) / w, 0, 1)
  const y0 = clamp((minY - padY) / h, 0, 1)
  const x1 = clamp((maxX + padX) / w, 0, 1)
  const y1 = clamp((maxY + padY) / h, 0, 1)
  return [x0, y0, Math.max(0.05, x1 - x0), Math.max(0.05, y1 - y0)]
}

/** 無 ML 時：以角落取樣背景色做前景分離 */
async function heuristicCutout(img: HTMLImageElement): Promise<{
  canvas: HTMLCanvasElement
  bounds: [number, number, number, number]
}> {
  const { canvas, ctx } = canvasFromImage(img)
  const w = canvas.width
  const h = canvas.height
  const image = ctx.getImageData(0, 0, w, h)
  const d = image.data

  const samples: Array<[number, number, number]> = []
  const pts = [
    [2, 2],
    [w - 3, 2],
    [2, h - 3],
    [w - 3, h - 3],
    [w / 2, 2],
    [2, h / 2],
    [w - 3, h / 2],
  ]
  for (const [x, y] of pts) {
    const i = (Math.floor(y) * w + Math.floor(x)) * 4
    samples.push([d[i], d[i + 1], d[i + 2]])
  }
  const bg = [
    samples.reduce((s, v) => s + v[0], 0) / samples.length,
    samples.reduce((s, v) => s + v[1], 0) / samples.length,
    samples.reduce((s, v) => s + v[2], 0) / samples.length,
  ]

  // 動態閾值：影像平均與背景差異
  let diffSum = 0
  const step = 8
  let count = 0
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4
      diffSum += colorDist(d[i], d[i + 1], d[i + 2], bg[0], bg[1], bg[2])
      count++
    }
  }
  const avgDiff = diffSum / count
  const threshold = Math.max(28, Math.min(70, avgDiff * 0.55))

  for (let i = 0; i < d.length; i += 4) {
    const dist = colorDist(d[i], d[i + 1], d[i + 2], bg[0], bg[1], bg[2])
    if (dist < threshold) {
      d[i + 3] = 0
    } else {
      // 柔邊
      const edge = Math.min(1, (dist - threshold) / 18)
      d[i + 3] = Math.round(255 * edge)
    }
  }
  ctx.putImageData(image, 0, 0)
  const bounds = boundsFromAlpha(ctx, w, h, 20)
  if (!bounds) {
    return { canvas, bounds: [0.15, 0.05, 0.7, 0.9] }
  }
  return { canvas, bounds }
}

function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function avgPoints(points: Point[]): Point {
  const n = points.length || 1
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  }
}

function rectFromCenter(cx: number, cy: number, w: number, h: number): [number, number, number, number] {
  return [clamp(cx - w / 2, 0, 1), clamp(cy - h / 2, 0, 1), clamp(w, 0.01, 1), clamp(h, 0.01, 1)]
}

function rectFromPoints(points: Point[], padX = 0.02, padY = 0.02): [number, number, number, number] {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs) - padX
  const maxX = Math.max(...xs) + padX
  const minY = Math.min(...ys) - padY
  const maxY = Math.max(...ys) + padY
  return [
    clamp(minX, 0, 1),
    clamp(minY, 0, 1),
    clamp(maxX - minX, 0.01, 1),
    clamp(maxY - minY, 0.01, 1),
  ]
}

function layer(
  id: string,
  label: string,
  rect: [number, number, number, number],
  pivot?: [number, number],
): BodyPartRegion {
  return { id, label, rect, pivot, color: LAYER_COLORS[id] ?? '#2ec4b6' }
}

function estimateLayersFromBounds(bounds: [number, number, number, number]): {
  layers: BodyPartRegion[]
  landmarks: LandmarkPoint[]
} {
  const [bx, by, bw, bh] = bounds
  const headH = bh * 0.22
  const headW = bw * 0.42
  const headX = bx + (bw - headW) / 2
  const headY = by + bh * 0.02

  const eyeY = headY + headH * 0.42
  const eyeW = headW * 0.18
  const eyeH = headH * 0.12
  const eyeLX = headX + headW * 0.22
  const eyeRX = headX + headW * 0.6

  const mouthW = headW * 0.28
  const mouthH = headH * 0.12
  const mouthX = headX + (headW - mouthW) / 2
  const mouthY = headY + headH * 0.68

  const noseW = headW * 0.12
  const noseH = headH * 0.14
  const noseX = headX + (headW - noseW) / 2
  const noseY = headY + headH * 0.52

  const bodyY = headY + headH * 0.85
  const bodyH = bh * 0.38
  const bodyW = bw * 0.55
  const bodyX = bx + (bw - bodyW) / 2

  const armW = bw * 0.22
  const armH = bh * 0.32
  const armY = bodyY + bodyH * 0.05

  const legsY = bodyY + bodyH * 0.85
  const legsH = Math.max(0.08, by + bh - legsY)
  const legsW = bw * 0.45
  const legsX = bx + (bw - legsW) / 2

  const layers: BodyPartRegion[] = [
    layer('person', '人物', bounds, [0.5, 0.5]),
    layer('legs', '腿部', [legsX, legsY, legsW, legsH], [0.5, 0.05]),
    layer('body', '身體', [bodyX, bodyY, bodyW, bodyH], [0.5, 0.15]),
    layer('clothes', '衣服', [bodyX, bodyY + bodyH * 0.05, bodyW, bodyH * 0.75], [0.5, 0.2]),
    layer('armL', '左手臂', [bx, armY, armW, armH], [0.8, 0.1]),
    layer('armR', '右手臂', [bx + bw - armW, armY, armW, armH], [0.2, 0.1]),
    layer('hair', '頭髮', [headX - headW * 0.08, Math.max(0, headY - headH * 0.15), headW * 1.16, headH * 0.55], [0.5, 0.9]),
    layer('head', '頭部', [headX, headY, headW, headH], [0.5, 0.85]),
    layer('eyeL', '左眼', [eyeLX, eyeY, eyeW, eyeH], [0.5, 0.5]),
    layer('eyeR', '右眼', [eyeRX, eyeY, eyeW, eyeH], [0.5, 0.5]),
    layer('nose', '鼻子', [noseX, noseY, noseW, noseH], [0.5, 0.5]),
    layer('mouth', '嘴巴', [mouthX, mouthY, mouthW, mouthH], [0.5, 0.2]),
  ]

  const landmarks: LandmarkPoint[] = [
    { id: 'nose', label: '鼻', x: noseX + noseW / 2, y: noseY + noseH / 2, group: 'face' },
    { id: 'eyeL', label: '左眼', x: eyeLX + eyeW / 2, y: eyeY + eyeH / 2, group: 'face' },
    { id: 'eyeR', label: '右眼', x: eyeRX + eyeW / 2, y: eyeY + eyeH / 2, group: 'face' },
    { id: 'mouth', label: '嘴', x: mouthX + mouthW / 2, y: mouthY + mouthH / 2, group: 'face' },
    { id: 'shoulderL', label: '左肩', x: bodyX, y: bodyY + bodyH * 0.08, group: 'pose' },
    { id: 'shoulderR', label: '右肩', x: bodyX + bodyW, y: bodyY + bodyH * 0.08, group: 'pose' },
    { id: 'hipL', label: '左髖', x: bodyX + bodyW * 0.2, y: bodyY + bodyH * 0.9, group: 'pose' },
    { id: 'hipR', label: '右髖', x: bodyX + bodyW * 0.8, y: bodyY + bodyH * 0.9, group: 'pose' },
    { id: 'wristL', label: '左腕', x: bx + armW * 0.4, y: armY + armH * 0.85, group: 'pose' },
    { id: 'wristR', label: '右腕', x: bx + bw - armW * 0.4, y: armY + armH * 0.85, group: 'pose' },
  ]

  return { layers, landmarks }
}

function layersFromMediaPipe(
  facePts: Point[] | null,
  posePts: Point[] | null,
  bounds: [number, number, number, number],
): { layers: BodyPartRegion[]; landmarks: LandmarkPoint[] } | null {
  if (!facePts && !posePts) return null

  const landmarks: LandmarkPoint[] = []
  const layers: BodyPartRegion[] = [layer('person', '人物', bounds, [0.5, 0.5])]

  if (posePts && posePts.length >= 29) {
    const lShoulder = posePts[11]
    const rShoulder = posePts[12]
    const lElbow = posePts[13]
    const rElbow = posePts[14]
    const lWrist = posePts[15]
    const rWrist = posePts[16]
    const lHip = posePts[23]
    const rHip = posePts[24]
    const lKnee = posePts[25]
    const rKnee = posePts[26]
    const lAnkle = posePts[27]
    const rAnkle = posePts[28]
    const nose = posePts[0]

    landmarks.push(
      { id: 'nose', label: '鼻', x: nose.x, y: nose.y, group: 'pose' },
      { id: 'shoulderL', label: '左肩', x: lShoulder.x, y: lShoulder.y, group: 'pose' },
      { id: 'shoulderR', label: '右肩', x: rShoulder.x, y: rShoulder.y, group: 'pose' },
      { id: 'elbowL', label: '左肘', x: lElbow.x, y: lElbow.y, group: 'pose' },
      { id: 'elbowR', label: '右肘', x: rElbow.x, y: rElbow.y, group: 'pose' },
      { id: 'wristL', label: '左腕', x: lWrist.x, y: lWrist.y, group: 'pose' },
      { id: 'wristR', label: '右腕', x: rWrist.x, y: rWrist.y, group: 'pose' },
      { id: 'hipL', label: '左髖', x: lHip.x, y: lHip.y, group: 'pose' },
      { id: 'hipR', label: '右髖', x: rHip.x, y: rHip.y, group: 'pose' },
    )

    const shoulderMid = avgPoints([lShoulder, rShoulder])
    const hipMid = avgPoints([lHip, rHip])
    const torsoW = Math.max(0.08, Math.abs(rShoulder.x - lShoulder.x) * 1.35)
    const torsoH = Math.max(0.1, Math.abs(hipMid.y - shoulderMid.y) * 1.25)
    layers.push(
      layer('body', '身體', rectFromCenter(shoulderMid.x, (shoulderMid.y + hipMid.y) / 2, torsoW, torsoH), [0.5, 0.1]),
      layer('clothes', '衣服', rectFromCenter(shoulderMid.x, (shoulderMid.y + hipMid.y) / 2, torsoW * 0.95, torsoH * 0.9), [0.5, 0.15]),
      layer('armL', '左手臂', rectFromPoints([lShoulder, lElbow, lWrist], 0.04, 0.04), [0.8, 0.1]),
      layer('armR', '右手臂', rectFromPoints([rShoulder, rElbow, rWrist], 0.04, 0.04), [0.2, 0.1]),
      layer('legs', '腿部', rectFromPoints([lHip, rHip, lKnee, rKnee, lAnkle, rAnkle], 0.04, 0.03), [0.5, 0.05]),
    )

    if (!facePts) {
      const headSize = Math.abs(rShoulder.x - lShoulder.x) * 0.85
      layers.push(layer('head', '頭部', rectFromCenter(nose.x, nose.y - headSize * 0.15, headSize, headSize * 1.15), [0.5, 0.85]))
    }
  }

  if (facePts && facePts.length > 400) {
    // MediaPipe FaceMesh 索引
    const leftEye = avgPoints([facePts[33], facePts[133], facePts[159], facePts[145]])
    const rightEye = avgPoints([facePts[362], facePts[263], facePts[386], facePts[374]])
    const mouth = avgPoints([facePts[13], facePts[14], facePts[78], facePts[308]])
    const nose = facePts[1]
    const faceOvalIdx = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
    const oval = faceOvalIdx.map((i) => facePts[i]).filter(Boolean)
    const headRect = rectFromPoints(oval.length ? oval : [leftEye, rightEye, mouth, nose], 0.03, 0.05)

    landmarks.push(
      { id: 'eyeL', label: '左眼', x: leftEye.x, y: leftEye.y, group: 'face' },
      { id: 'eyeR', label: '右眼', x: rightEye.x, y: rightEye.y, group: 'face' },
      { id: 'mouth', label: '嘴', x: mouth.x, y: mouth.y, group: 'face' },
      { id: 'noseFace', label: '鼻尖', x: nose.x, y: nose.y, group: 'face' },
    )

    const eyeW = Math.abs(rightEye.x - leftEye.x) * 0.28
    const eyeH = eyeW * 0.55
    layers.push(
      layer('head', '頭部', headRect, [0.5, 0.85]),
      layer('hair', '頭髮', [headRect[0], Math.max(0, headRect[1] - headRect[3] * 0.25), headRect[2], headRect[3] * 0.55], [0.5, 0.9]),
      layer('eyeL', '左眼', rectFromCenter(leftEye.x, leftEye.y, eyeW, eyeH), [0.5, 0.5]),
      layer('eyeR', '右眼', rectFromCenter(rightEye.x, rightEye.y, eyeW, eyeH), [0.5, 0.5]),
      layer('nose', '鼻子', rectFromCenter(nose.x, nose.y, eyeW * 0.7, eyeH * 1.2), [0.5, 0.5]),
      layer('mouth', '嘴巴', rectFromCenter(mouth.x, mouth.y, eyeW * 1.3, eyeH * 0.9), [0.5, 0.2]),
    )
  }

  // 補齊缺層
  const estimated = estimateLayersFromBounds(bounds)
  for (const l of estimated.layers) {
    if (!layers.find((x) => x.id === l.id)) layers.push(l)
  }
  for (const p of estimated.landmarks) {
    if (!landmarks.find((x) => x.id === p.id)) landmarks.push(p)
  }

  return { layers, landmarks }
}

async function detectMediaPipe(img: HTMLImageElement): Promise<{
  face: Point[] | null
  pose: Point[] | null
}> {
  try {
    await ensureVision()
  } catch {
    return { face: null, pose: null }
  }

  let face: Point[] | null = null
  let pose: Point[] | null = null

  try {
    const faceResult = faceLandmarker!.detect(img)
    const lm = faceResult.faceLandmarks?.[0]
    if (lm?.length) face = lm.map((p) => ({ x: p.x, y: p.y }))
  } catch {
    face = null
  }

  try {
    const poseResult = poseLandmarker!.detect(img)
    const lm = poseResult.landmarks?.[0]
    if (lm?.length) pose = lm.map((p) => ({ x: p.x, y: p.y }))
  } catch {
    pose = null
  }

  return { face, pose }
}

/**
 * 人物截取 + 五官／肢體標定。
 * 優先：去背景 ML → MediaPipe 臉/姿勢；失敗則啟發式前景 + 相對比例估算。
 */
export async function analyzePerson(
  file: File,
  onProgress?: (message: string, percent: number) => void,
): Promise<PersonAnalysis> {
  const warnings: string[] = []
  const methods: string[] = []

  onProgress?.('載入圖片…', 5)
  const sourceImg = await loadHtmlImage(file)
  const sourceWidth = sourceImg.naturalWidth
  const sourceHeight = sourceImg.naturalHeight

  onProgress?.('截取人物（去背景）…', 20)
  let cutoutCanvas: HTMLCanvasElement | null = null
  let personBounds: [number, number, number, number] | null = null

  try {
    const blob = await removeBackground(file, {
      progress: (key: string, current: number, total: number) => {
        if (!total) return
        const p = 20 + Math.round((current / total) * 35)
        onProgress?.(`截取人物：${key}…`, Math.min(55, p))
      },
    })
    const cutoutImg = await loadHtmlImage(blob)
    const built = canvasFromImage(cutoutImg)
    cutoutCanvas = built.canvas
    personBounds = boundsFromAlpha(built.ctx, built.canvas.width, built.canvas.height)
    methods.push('imgly-rembg')
    if (!personBounds) {
      warnings.push('去背景成功但遮罩偏空，改用啟發式範圍')
    }
  } catch (e) {
    warnings.push(`AI 去背景失敗，改用啟發式分離（${e instanceof Error ? e.message : '未知錯誤'}）`)
  }

  if (!cutoutCanvas || !personBounds) {
    onProgress?.('啟發式分離人物…', 45)
    const heuristic = await heuristicCutout(sourceImg)
    cutoutCanvas = heuristic.canvas
    personBounds = heuristic.bounds
    methods.push('heuristic-matte')
  }

  onProgress?.('偵測五官與肢體關鍵點…', 65)
  const { face, pose } = await detectMediaPipe(sourceImg)
  if (face) methods.push('mediapipe-face')
  if (pose) methods.push('mediapipe-pose')
  if (!face && !pose) {
    warnings.push('未偵測到標準人臉／姿勢（插畫或非正面常見），已依人物外框估算五官與肢體')
    methods.push('bounds-estimate')
  }

  onProgress?.('建立圖層與沿邊標定…', 82)
  const fromMp = layersFromMediaPipe(face, pose, personBounds)
  const packed = fromMp ?? estimateLayersFromBounds(personBounds)

  onProgress?.('沿邊緣裁切部位並挖空底圖…', 90)
  const built = buildContouredLayers({
    cutoutCanvas,
    layers: packed.layers,
    landmarks: packed.landmarks,
    facePts: face,
  })
  methods.push('contour-layers')

  onProgress?.('人物分析完成', 100)
  return {
    cutoutUrl: built.cutoutUrl,
    baseUrl: built.baseUrl,
    sourceWidth,
    sourceHeight,
    personBounds,
    layers: built.layers,
    landmarks: built.landmarks,
    method: methods.join('+'),
    warnings,
  }
}
