import type { BodyPartRegion, LandmarkPoint } from '../types'
import {
  boundsOfContour,
  contourFromIndices,
  ellipseContour,
  extractLargestContourInRoi,
  type NormPoint,
} from './contour'

export interface BuiltLayers {
  layers: BodyPartRegion[]
  landmarks: LandmarkPoint[]
  baseUrl: string
  cutoutUrl: string
}

const MOVABLE = new Set(['head', 'armL', 'armR'])

const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
  176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
]
const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
const RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]
const LIPS_OUTER = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185,
]

/**
 * 為各部位補上沿邊緣輪廓，並產出：
 * - 可動部位獨立 sprite
 * - 挖空可動部位後的底圖（動作時不露原圖殘影）
 */
export function buildContouredLayers(options: {
  cutoutCanvas: HTMLCanvasElement
  layers: BodyPartRegion[]
  landmarks: LandmarkPoint[]
  facePts: Array<{ x: number; y: number }> | null
}): BuiltLayers {
  const { cutoutCanvas, facePts } = options
  const w = cutoutCanvas.width
  const h = cutoutCanvas.height
  const ctx = cutoutCanvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('無法讀取去背畫布')
  const image = ctx.getImageData(0, 0, w, h)
  const alpha = image.data

  let layers = options.layers.map((l) => ({ ...l }))
  let landmarks = [...options.landmarks]

  // MediaPipe 臉部輪廓優先
  if (facePts && facePts.length > 400) {
    const headC = contourFromIndices(facePts, FACE_OVAL)
    const eyeLC = contourFromIndices(facePts, LEFT_EYE)
    const eyeRC = contourFromIndices(facePts, RIGHT_EYE)
    const mouthC = contourFromIndices(facePts, LIPS_OUTER)
    layers = upsertContour(layers, 'head', '頭部', headC, '#5ad2ff')
    layers = upsertContour(layers, 'eyeL', '左眼', eyeLC, '#ffd166')
    layers = upsertContour(layers, 'eyeR', '右眼', eyeRC, '#ffd166')
    layers = upsertContour(layers, 'mouth', '嘴巴', mouthC, '#ff6b8a')
    landmarks = upsertLandmark(landmarks, 'eyeL', '左眼', centroid(eyeLC), 'face')
    landmarks = upsertLandmark(landmarks, 'eyeR', '右眼', centroid(eyeRC), 'face')
    landmarks = upsertLandmark(landmarks, 'mouth', '嘴', centroid(mouthC), 'face')
  }

  // 其餘部位：依 ROI∩人物 alpha 追蹤邊線
  layers = layers.map((part) => {
    if (part.contour && part.contour.length >= 6) return part
    if (part.id === 'person') {
      const c = extractLargestContourInRoi(alpha, w, h, part.rect, 30)
      return c ? { ...part, contour: c, rect: boundsOfContour(c) } : part
    }
    const c = extractLargestContourInRoi(alpha, w, h, expandRect(part.rect, 0.02), 35)
    if (!c) {
      const [rx, ry, rw, rh] = part.rect
      return {
        ...part,
        contour: ellipseContour(rx + rw / 2, ry + rh / 2, rw * 0.45, rh * 0.45, 20),
      }
    }
    return { ...part, contour: c, rect: tightRectFromContourAndRoi(c, part.rect) }
  })

  // 插畫常見：微調五官到頭部內的暗區
  const head = layers.find((l) => l.id === 'head')
  if (head?.contour) {
    const refined = refineFacialLandmarks(alpha, w, h, head.rect, landmarks)
    landmarks = refined.landmarks
    layers = layers.map((l) => {
      if (l.id === 'eyeL' && refined.eyeL) return { ...l, contour: refined.eyeL, rect: boundsOfContour(refined.eyeL) }
      if (l.id === 'eyeR' && refined.eyeR) return { ...l, contour: refined.eyeR, rect: boundsOfContour(refined.eyeR) }
      if (l.id === 'mouth' && refined.mouth) return { ...l, contour: refined.mouth, rect: boundsOfContour(refined.mouth) }
      return l
    })
  }

  // 產出可動 sprite + 挖空底圖
  const baseCanvas = document.createElement('canvas')
  baseCanvas.width = w
  baseCanvas.height = h
  const baseCtx = baseCanvas.getContext('2d')!
  baseCtx.drawImage(cutoutCanvas, 0, 0)

  layers = layers.map((part) => {
    if (!MOVABLE.has(part.id) || !part.contour) return part
    const sprite = extractSprite(cutoutCanvas, part.contour, part.rect)
    // 從底圖挖空（destination-out）
    punchContour(baseCtx, part.contour, w, h)
    return {
      ...part,
      spriteUrl: sprite.url,
      spriteRect: sprite.rect,
      pivot: part.pivot ?? guessPivot(part.id),
    }
  })

  return {
    layers,
    landmarks,
    baseUrl: baseCanvas.toDataURL('image/png'),
    cutoutUrl: cutoutCanvas.toDataURL('image/png'),
  }
}

function expandRect(
  rect: [number, number, number, number],
  pad: number,
): [number, number, number, number] {
  const [x, y, w, h] = rect
  return [
    Math.max(0, x - pad),
    Math.max(0, y - pad),
    Math.min(1, w + pad * 2),
    Math.min(1, h + pad * 2),
  ]
}

function tightRectFromContourAndRoi(
  contour: NormPoint[],
  roi: [number, number, number, number],
): [number, number, number, number] {
  const b = boundsOfContour(contour)
  // 不讓輪廓框暴衝出原 ROI 太多
  const x0 = Math.max(roi[0] - 0.02, b[0])
  const y0 = Math.max(roi[1] - 0.02, b[1])
  const x1 = Math.min(roi[0] + roi[2] + 0.02, b[0] + b[2])
  const y1 = Math.min(roi[1] + roi[3] + 0.02, b[1] + b[3])
  return [x0, y0, Math.max(0.01, x1 - x0), Math.max(0.01, y1 - y0)]
}

function upsertContour(
  layers: BodyPartRegion[],
  id: string,
  label: string,
  contour: NormPoint[],
  color: string,
): BodyPartRegion[] {
  const rect = boundsOfContour(contour)
  const next = { id, label, rect, contour, color, pivot: guessPivot(id) }
  const idx = layers.findIndex((l) => l.id === id)
  if (idx >= 0) {
    const copy = [...layers]
    copy[idx] = { ...copy[idx], ...next }
    return copy
  }
  return [...layers, next]
}

function upsertLandmark(
  list: LandmarkPoint[],
  id: string,
  label: string,
  p: { x: number; y: number },
  group: LandmarkPoint['group'],
): LandmarkPoint[] {
  const item = { id, label, x: p.x, y: p.y, group }
  const idx = list.findIndex((l) => l.id === id)
  if (idx >= 0) {
    const copy = [...list]
    copy[idx] = item
    return copy
  }
  return [...list, item]
}

function centroid(contour: NormPoint[]) {
  const n = contour.length || 1
  return {
    x: contour.reduce((s, p) => s + p[0], 0) / n,
    y: contour.reduce((s, p) => s + p[1], 0) / n,
  }
}

function guessPivot(id: string): [number, number] {
  if (id === 'head') return [0.5, 0.85]
  if (id === 'armL') return [0.75, 0.12]
  if (id === 'armR') return [0.25, 0.12]
  return [0.5, 0.5]
}

function punchContour(
  ctx: CanvasRenderingContext2D,
  contour: NormPoint[],
  w: number,
  h: number,
) {
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  contour.forEach(([x, y], i) => {
    const px = x * w
    const py = y * h
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  })
  ctx.closePath()
  // 稍微膨脹避免縫隙
  ctx.fill()
  ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.004)
  ctx.stroke()
  ctx.restore()
}

function extractSprite(
  source: HTMLCanvasElement,
  contour: NormPoint[],
  fallbackRect: [number, number, number, number],
) {
  const w = source.width
  const h = source.height
  const rect = boundsOfContour(contour)
  const pad = 0.01
  const x0 = Math.max(0, Math.floor((rect[0] - pad) * w))
  const y0 = Math.max(0, Math.floor((rect[1] - pad) * h))
  const x1 = Math.min(w, Math.ceil((rect[0] + rect[2] + pad) * w))
  const y1 = Math.min(h, Math.ceil((rect[1] + rect[3] + pad) * h))
  const sw = Math.max(1, x1 - x0)
  const sh = Math.max(1, y1 - y0)

  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')!
  ctx.save()
  ctx.beginPath()
  contour.forEach(([x, y], i) => {
    const px = x * w - x0
    const py = y * h - y0
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  })
  ctx.closePath()
  ctx.clip()
  ctx.drawImage(source, x0, y0, sw, sh, 0, 0, sw, sh)
  ctx.restore()

  return {
    url: canvas.toDataURL('image/png'),
    rect: (rect[2] > 0.01 ? rect : fallbackRect) as [number, number, number, number],
  }
}

/** 在頭部區域內以亮度谷值微調眼／嘴位置（適合插畫） */
function refineFacialLandmarks(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  headRect: [number, number, number, number],
  landmarks: LandmarkPoint[],
) {
  const [hx, hy, hw, hh] = headRect
  const eyeBandY0 = hy + hh * 0.28
  const eyeBandY1 = hy + hh * 0.52
  const mouthBandY0 = hy + hh * 0.62
  const mouthBandY1 = hy + hh * 0.82

  const leftEyeZone: [number, number, number, number] = [hx + hw * 0.12, eyeBandY0, hw * 0.32, eyeBandY1 - eyeBandY0]
  const rightEyeZone: [number, number, number, number] = [hx + hw * 0.56, eyeBandY0, hw * 0.32, eyeBandY1 - eyeBandY0]
  const mouthZone: [number, number, number, number] = [hx + hw * 0.28, mouthBandY0, hw * 0.44, mouthBandY1 - mouthBandY0]

  const eyeLpt = darkestCentroid(rgba, w, h, leftEyeZone) ?? { x: hx + hw * 0.32, y: (eyeBandY0 + eyeBandY1) / 2 }
  const eyeRpt = darkestCentroid(rgba, w, h, rightEyeZone) ?? { x: hx + hw * 0.68, y: (eyeBandY0 + eyeBandY1) / 2 }
  const mouthPt = darkestCentroid(rgba, w, h, mouthZone) ?? { x: hx + hw * 0.5, y: (mouthBandY0 + mouthBandY1) / 2 }

  const eyeRx = hw * 0.09
  const eyeRy = hh * 0.045
  const mouthRx = hw * 0.14
  const mouthRy = hh * 0.05

  let next = [...landmarks]
  next = upsertLandmark(next, 'eyeL', '左眼', eyeLpt, 'face')
  next = upsertLandmark(next, 'eyeR', '右眼', eyeRpt, 'face')
  next = upsertLandmark(next, 'mouth', '嘴', mouthPt, 'face')

  return {
    landmarks: next,
    eyeL: ellipseContour(eyeLpt.x, eyeLpt.y, eyeRx, eyeRy, 18),
    eyeR: ellipseContour(eyeRpt.x, eyeRpt.y, eyeRx, eyeRy, 18),
    mouth: ellipseContour(mouthPt.x, mouthPt.y, mouthRx, mouthRy, 20),
  }
}

function darkestCentroid(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  zone: [number, number, number, number],
): { x: number; y: number } | null {
  const x0 = Math.max(0, Math.floor(zone[0] * w))
  const y0 = Math.max(0, Math.floor(zone[1] * h))
  const x1 = Math.min(w, Math.ceil((zone[0] + zone[2]) * w))
  const y1 = Math.min(h, Math.ceil((zone[1] + zone[3]) * h))
  let sumW = 0
  let sx = 0
  let sy = 0
  let found = false
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * w + x) * 4
      if (rgba[i + 3] < 40) continue
      const lum = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]
      if (lum > 140) continue
      const weight = (160 - lum) / 160
      sumW += weight
      sx += x * weight
      sy += y * weight
      found = true
    }
  }
  if (!found || sumW < 1e-3) return null
  return { x: sx / sumW / w, y: sy / sumW / h }
}
