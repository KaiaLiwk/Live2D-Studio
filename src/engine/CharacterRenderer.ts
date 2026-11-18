import type { GeneratedModel, LandmarkPoint, ModelParams } from '../types'

/**
 * 分層渲染：底圖已挖空可動部位，動作時不露原圖殘影；
 * 表情錨定五官關鍵點；標定沿輪廓邊線。
 */
export class CharacterRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private baseImage: HTMLImageElement | null = null
  private sprites = new Map<string, HTMLImageElement>()
  private model: GeneratedModel | null = null
  private params: ModelParams | null = null
  private bg: string | CanvasImageSource = '#0f1720'
  private dpr = 1
  private showOverlay = true

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 不支援 2D context')
    this.canvas = canvas
    this.ctx = ctx
  }

  setBackground(bg: string | CanvasImageSource) {
    this.bg = bg
  }

  setShowOverlay(v: boolean) {
    this.showOverlay = v
    this.draw()
  }

  async setModel(model: GeneratedModel) {
    this.model = model
    this.sprites.clear()
    this.baseImage = await loadImage(model.baseImageUrl || model.imageUrl)

    await Promise.all(
      model.layers
        .filter((l) => l.spriteUrl)
        .map(async (l) => {
          this.sprites.set(l.id, await loadImage(l.spriteUrl!))
        }),
    )

    this.resize()
    this.draw()
  }

  clearModel() {
    this.model = null
    this.baseImage = null
    this.sprites.clear()
    this.draw()
  }

  setParams(params: ModelParams) {
    this.params = params
    this.draw()
  }

  resize() {
    const parent = this.canvas.parentElement
    if (!parent) return
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = parent.clientWidth
    const h = parent.clientHeight
    this.canvas.width = Math.max(1, Math.floor(w * this.dpr))
    this.canvas.height = Math.max(1, Math.floor(h * this.dpr))
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.draw()
  }

  draw() {
    const { ctx, canvas } = this
    const w = canvas.width
    const h = canvas.height
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)

    if (typeof this.bg === 'string') {
      ctx.fillStyle = this.bg
      ctx.fillRect(0, 0, w, h)
    } else {
      ctx.drawImage(this.bg, 0, 0, w, h)
    }

    this.drawChecker(w, h)

    if (!this.baseImage || !this.model || !this.params) {
      this.drawPlaceholder()
      return
    }

    const img = this.baseImage
    const p = this.params
    const fit = fitContain(img.naturalWidth, img.naturalHeight, w * 0.82, h * 0.88)
    const ox = (w - fit.w) / 2
    const oy = (h - fit.h) / 2 + p.ParamBreath * fit.h * 0.01

    ctx.save()
    ctx.translate(w / 2, h * 0.55)
    ctx.rotate((p.ParamBodyAngleX * Math.PI) / 180)
    ctx.translate(-w / 2, -h * 0.55)

    // 1) 底圖（可動部位已挖空）
    ctx.save()
    ctx.translate(ox + fit.w / 2, oy + fit.h * 0.55)
    ctx.scale(1, 1 + p.ParamBreath * 0.01)
    ctx.translate(-(ox + fit.w / 2), -(oy + fit.h * 0.55))
    ctx.drawImage(img, ox, oy, fit.w, fit.h)
    ctx.restore()

    // 2) 可動圖層（沿輪廓裁切的 sprite）
    this.drawPartSprite('armL', ox, oy, fit.w, fit.h, {
      rotateDeg: p.ParamArmL * 0.55,
      pivotYBias: 0.12,
    })
    this.drawPartSprite('armR', ox, oy, fit.w, fit.h, {
      rotateDeg: p.ParamArmR * 0.55,
      pivotYBias: 0.12,
    })
    this.drawPartSprite('head', ox, oy, fit.w, fit.h, {
      rotateDeg: p.ParamAngleX * 0.4,
      offsetY: p.ParamAngleY * 0.4,
      pivotYBias: 0.85,
    })

    // 3) 表情錨定五官關鍵點
    this.drawFaceExpression(ox, oy, fit.w, fit.h, p)

    // 4) 沿邊標定
    if (this.showOverlay) {
      this.drawCalibrationOverlay(ox, oy, fit.w, fit.h)
    }

    ctx.restore()
  }

  private drawPartSprite(
    id: string,
    ox: number,
    oy: number,
    dw: number,
    dh: number,
    opts: { rotateDeg?: number; offsetY?: number; pivotYBias?: number },
  ) {
    if (!this.model) return
    const part = this.model.layers.find((l) => l.id === id)
    const sprite = this.sprites.get(id)
    if (!part || !sprite) return

    const rect = part.spriteRect ?? part.rect
    const [rx, ry, rw, rh] = rect
    const dx = ox + rx * dw
    const dy = oy + ry * dh
    const tw = rw * dw
    const th = rh * dh
    const pivotX = dx + tw * (part.pivot?.[0] ?? 0.5)
    const pivotY = dy + th * (opts.pivotYBias ?? part.pivot?.[1] ?? 0.5)

    const ctx = this.ctx
    ctx.save()
    ctx.translate(pivotX, pivotY + (opts.offsetY ?? 0))
    ctx.rotate(((opts.rotateDeg ?? 0) * Math.PI) / 180)
    ctx.translate(-pivotX, -pivotY)
    ctx.drawImage(sprite, dx, dy, tw, th)
    ctx.restore()
  }

  private landmark(id: string): LandmarkPoint | undefined {
    return this.model?.landmarks.find((l) => l.id === id)
  }

  private interocular(dw: number, dh: number) {
    const a = this.landmark('eyeL')
    const b = this.landmark('eyeR')
    if (!a || !b) return Math.min(dw, dh) * 0.06
    const dx = (b.x - a.x) * dw
    const dy = (b.y - a.y) * dh
    return Math.max(8, Math.hypot(dx, dy))
  }

  private drawFaceExpression(ox: number, oy: number, dw: number, dh: number, p: ModelParams) {
    const eyeL = this.landmark('eyeL')
    const eyeR = this.landmark('eyeR')
    const mouth = this.landmark('mouth')
    const iod = this.interocular(dw, dh)
    const ctx = this.ctx

    // 眨眼：覆蓋在眼睛關鍵點
    for (const [lm, open] of [
      [eyeL, p.ParamEyeLOpen],
      [eyeR, p.ParamEyeROpen],
    ] as const) {
      if (!lm || open >= 0.98) continue
      const x = ox + lm.x * dw
      const y = oy + lm.y * dh
      const close = 1 - Math.max(0, Math.min(1, open))
      ctx.save()
      ctx.fillStyle = `rgba(18, 14, 20, ${0.35 + close * 0.5})`
      ctx.beginPath()
      ctx.ellipse(x, y, iod * 0.28, iod * (0.06 + close * 0.22), 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    if (!mouth) return
    const mx = ox + mouth.x * dw
    const my = oy + mouth.y * dh
    const open = Math.max(0, Math.min(1, p.ParamMouthOpenY))
    const form = p.ParamMouthForm
    const brow = (p.ParamBrowLY + p.ParamBrowRY) / 2

    ctx.save()
    ctx.translate(mx, my)

    // 眉毛（悲傷／驚訝）
    if (Math.abs(brow) > 0.05 && eyeL && eyeR) {
      ctx.strokeStyle = `rgba(40, 30, 28, ${0.25 + Math.abs(brow) * 0.35})`
      ctx.lineWidth = Math.max(1.2, iod * 0.06)
      ctx.lineCap = 'round'
      const lift = -brow * iod * 0.35
      const tilt = brow * 0.5
      for (const side of [-1, 1] as const) {
        const ex = ((side < 0 ? eyeL : eyeR).x - mouth.x) * dw
        const ey = ((side < 0 ? eyeL : eyeR).y - mouth.y) * dh - iod * 0.45 + lift
        ctx.beginPath()
        ctx.moveTo(ex - iod * 0.18, ey + tilt * side * 4)
        ctx.lineTo(ex + iod * 0.18, ey - tilt * side * 4)
        ctx.stroke()
      }
    }

    if (open > 0.04) {
      // 張嘴：錨在嘴部關鍵點
      ctx.fillStyle = 'rgba(36, 16, 20, 0.82)'
      ctx.beginPath()
      ctx.ellipse(0, open * iod * 0.08, iod * 0.28, iod * (0.08 + open * 0.28), 0, 0, Math.PI * 2)
      ctx.fill()
      if (open > 0.25) {
        ctx.fillStyle = 'rgba(180, 70, 85, 0.4)'
        ctx.beginPath()
        ctx.ellipse(0, open * iod * 0.12, iod * 0.16, iod * open * 0.12, 0, 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (Math.abs(form) > 0.12) {
      // 微笑／撇嘴：小弧線貼在嘴部，避免飄到頭頂
      ctx.strokeStyle = `rgba(48, 28, 32, ${0.35 + Math.abs(form) * 0.4})`
      ctx.lineWidth = Math.max(1.4, iod * 0.07)
      ctx.lineCap = 'round'
      ctx.beginPath()
      if (form > 0) {
        ctx.arc(0, -iod * 0.06, iod * 0.22, 0.2 * Math.PI, 0.8 * Math.PI)
      } else {
        ctx.arc(0, iod * 0.16, iod * 0.2, 1.2 * Math.PI, 1.8 * Math.PI)
      }
      ctx.stroke()
    }

    ctx.restore()
  }

  private drawCalibrationOverlay(ox: number, oy: number, dw: number, dh: number) {
    if (!this.model) return
    const ctx = this.ctx
    const scale = this.dpr

    ctx.save()
    for (const part of this.model.layers) {
      if (part.id === 'person' || part.id === 'clothes' || part.id === 'legs' || part.id === 'body') {
        // 大部位用較淡邊線
      }
      const contour = part.contour
      if (!contour || contour.length < 3) continue
      const color = part.color ?? '#2ec4b6'
      ctx.beginPath()
      contour.forEach(([x, y], i) => {
        const px = ox + x * dw
        const py = oy + y * dh
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.closePath()
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.95
      ctx.lineWidth = (part.id.startsWith('eye') || part.id === 'mouth' || part.id === 'nose' ? 1.8 : 1.4) * scale
      ctx.stroke()
      ctx.globalAlpha = 0.12
      ctx.fillStyle = color
      ctx.fill()
      ctx.globalAlpha = 1

      const c = contourCentroid(contour)
      ctx.fillStyle = color
      ctx.font = `600 ${Math.round(11 * scale)}px Outfit, sans-serif`
      ctx.fillText(part.label, ox + c[0] * dw + 4 * scale, oy + c[1] * dh - 4 * scale)
    }

    for (const lm of this.model.landmarks) {
      const x = ox + lm.x * dw
      const y = oy + lm.y * dh
      const color = lm.group === 'face' ? '#ffd166' : '#80ed99'
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, 3.5 * scale, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'
      ctx.lineWidth = scale
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawChecker(w: number, h: number) {
    const size = 18 * this.dpr
    const ctx = this.ctx
    ctx.save()
    ctx.globalAlpha = 0.16
    for (let y = 0; y < h; y += size) {
      for (let x = 0; x < w; x += size) {
        if ((((x / size) | 0) + ((y / size) | 0)) % 2 === 0) continue
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(x, y, size, size)
      }
    }
    ctx.restore()
  }

  private drawPlaceholder() {
    const { ctx, canvas } = this
    ctx.fillStyle = 'rgba(232, 238, 244, 0.45)'
    ctx.font = `${Math.round(16 * this.dpr)}px Outfit, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('上傳全身照以生成 Live2D 角色', canvas.width / 2, canvas.height / 2)
  }
}

function contourCentroid(contour: Array<[number, number]>): [number, number] {
  const n = contour.length || 1
  return [
    contour.reduce((s, p) => s + p[0], 0) / n,
    contour.reduce((s, p) => s + p[1], 0) / n,
  ]
}

function fitContain(srcW: number, srcH: number, maxW: number, maxH: number) {
  const scale = Math.min(maxW / srcW, maxH / srcH)
  return { w: srcW * scale, h: srcH * scale }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('貼圖載入失敗'))
    img.src = src
  })
}
