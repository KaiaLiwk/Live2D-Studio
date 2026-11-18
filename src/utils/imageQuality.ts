import type { QualityCheckResult } from '../types'

const MAX_BYTES = 10 * 1024 * 1024
const MIN_SIDE = 512
const RECOMMENDED_SIDE = 1024

export function validateFile(file: File): QualityCheckResult {
  const errors: string[] = []
  const warnings: string[] = []

  const okType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  if (!okType) {
    errors.push('僅支援 JPG、PNG、WEBP 格式')
  }

  if (file.size > MAX_BYTES) {
    errors.push('檔案不可超過 10MB')
  }

  if (file.size < 20 * 1024) {
    warnings.push('檔案偏小，細節可能不足')
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    score: errors.length === 0 ? 0.7 : 0,
  }
}

export async function analyzeImage(file: File): Promise<QualityCheckResult> {
  const base = validateFile(file)
  if (!base.ok) return base

  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap
  const warnings = [...base.warnings]
  const errors = [...base.errors]
  let score = 0.75

  if (Math.max(width, height) < MIN_SIDE) {
    errors.push(`解析度過低（${width}×${height}），建議至少 ${RECOMMENDED_SIDE}px`)
    score -= 0.4
  } else if (Math.max(width, height) < RECOMMENDED_SIDE) {
    warnings.push(`建議解析度 ≥ ${RECOMMENDED_SIDE}px（目前 ${width}×${height}）`)
    score -= 0.1
  }

  const ratio = height / width
  if (ratio < 1.05) {
    warnings.push('看起來不像全身照（偏橫向），生成手臂與腿部動作可能不準')
    score -= 0.15
  } else if (ratio > 2.4) {
    warnings.push('圖片過窄長，角色可能被裁切過多')
    score -= 0.05
  } else {
    score += 0.1
  }

  const brightness = await sampleBrightness(bitmap)
  if (brightness < 0.22) {
    warnings.push('光線偏暗，建議使用光線充足的照片')
    score -= 0.15
  } else if (brightness > 0.92) {
    warnings.push('曝光偏高，細節可能過曝')
    score -= 0.08
  } else {
    score += 0.08
  }

  const edgeDensity = await sampleEdgeDensity(bitmap)
  if (edgeDensity < 0.04) {
    warnings.push('畫面細節偏少，可能不是清晰人物照')
    score -= 0.1
  }
  if (edgeDensity > 0.45) {
    warnings.push('背景可能過於雜亂，建議使用乾淨背景')
    score -= 0.05
  }

  bitmap.close()

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    score: Math.max(0, Math.min(1, score)),
  }
}

async function sampleBrightness(bitmap: ImageBitmap): Promise<number> {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 0.5
  ctx.drawImage(bitmap, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)
  let sum = 0
  for (let i = 0; i < data.length; i += 4) {
    sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
  }
  return sum / (data.length / 4)
}

async function sampleEdgeDensity(bitmap: ImageBitmap): Promise<number> {
  const size = 48
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 0.1
  ctx.drawImage(bitmap, 0, 0, size, size)
  const { data } = ctx.getImageData(0, 0, size, size)
  let edges = 0
  let total = 0
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = (y * size + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
      const right = (y * size + x + 1) * 4
      const down = ((y + 1) * size + x) * 4
      const lumR = 0.2126 * data[right] + 0.7152 * data[right + 1] + 0.0722 * data[right + 2]
      const lumD = 0.2126 * data[down] + 0.7152 * data[down + 1] + 0.0722 * data[down + 2]
      if (Math.abs(lum - lumR) > 28 || Math.abs(lum - lumD) > 28) edges++
      total++
    }
  }
  return edges / total
}

export function loadImageUrl(file: File): Promise<{ url: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve({ url, width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('無法讀取圖片'))
    }
    img.src = url
  })
}
