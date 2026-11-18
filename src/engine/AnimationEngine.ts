import {
  DEFAULT_PARAMS,
  type ModelParams,
  type MotionClip,
  type ParamId,
  type PlaybackState,
} from '../types'
import { IDLE_MOTION } from './motions'

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function sampleClip(clip: MotionClip, time: number): Partial<ModelParams> {
  const t = clip.loop ? ((time % clip.duration) + clip.duration) % clip.duration : Math.min(time, clip.duration)
  const frames = clip.keyframes
  if (frames.length === 0) return {}
  if (t <= frames[0].time) return { ...frames[0].params }
  if (t >= frames[frames.length - 1].time) return { ...frames[frames.length - 1].params }

  let i = 0
  while (i < frames.length - 1 && frames[i + 1].time < t) i++
  const a = frames[i]
  const b = frames[i + 1]
  const span = Math.max(1e-6, b.time - a.time)
  const u = (t - a.time) / span
  // smoothstep
  const s = u * u * (3 - 2 * u)

  const keys = new Set([...Object.keys(a.params), ...Object.keys(b.params)]) as Set<ParamId>
  const out: Partial<ModelParams> = {}
  for (const key of keys) {
    const av = a.params[key]
    const bv = b.params[key]
    if (av == null && bv == null) continue
    out[key] = lerp(av ?? bv ?? 0, bv ?? av ?? 0, s)
  }
  return out
}

export type AnimListener = (params: ModelParams) => void

/**
 * 參數驅動動畫引擎：基礎軌道 + 疊加軌道（眨眼 / 拖曳 / 語音嘴型）
 */
export class AnimationEngine {
  private params: ModelParams = { ...DEFAULT_PARAMS }
  private baseClip: MotionClip | null = IDLE_MOTION
  private overlayClip: MotionClip | null = null
  private baseTime = 0
  private overlayTime = 0
  private state: PlaybackState = 'playing'
  private lastTs = 0
  private raf = 0
  private listeners = new Set<AnimListener>()
  private dragOffset = { x: 0, y: 0 }
  private nextBlinkAt = 2 + Math.random() * 3
  private blinkT = -1
  private mouthOverride: number | null = null
  private expressionBoost: Partial<ModelParams> = {}

  start() {
    if (this.raf) return
    this.lastTs = performance.now()
    const loop = (ts: number) => {
      const dt = Math.min(0.05, (ts - this.lastTs) / 1000)
      this.lastTs = ts
      if (this.state === 'playing') this.tick(dt)
      this.emit()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  subscribe(fn: AnimListener) {
    this.listeners.add(fn)
    fn(this.getParams())
    return () => this.listeners.delete(fn)
  }

  getParams(): ModelParams {
    return { ...this.params }
  }

  getState(): PlaybackState {
    return this.state
  }

  play() {
    this.state = 'playing'
  }

  pause() {
    this.state = 'paused'
  }

  stop() {
    this.state = 'stopped'
    this.baseTime = 0
    this.overlayTime = 0
    this.overlayClip = null
    this.baseClip = IDLE_MOTION
    this.params = { ...DEFAULT_PARAMS }
  }

  playMotion(clip: MotionClip, asOverlay = true) {
    if (asOverlay && clip.id !== 'idle') {
      this.overlayClip = clip
      this.overlayTime = 0
    } else {
      this.baseClip = clip
      this.baseTime = 0
      this.overlayClip = null
    }
    this.state = 'playing'
  }

  setIdle() {
    this.baseClip = IDLE_MOTION
    this.baseTime = 0
    this.overlayClip = null
    this.state = 'playing'
  }

  setDrag(nx: number, ny: number) {
    this.dragOffset.x = Math.max(-30, Math.min(30, nx * 30))
    this.dragOffset.y = Math.max(-20, Math.min(20, ny * 20))
  }

  setMouthOverride(v: number | null) {
    this.mouthOverride = v
  }

  setExpression(expr: 'neutral' | 'happy' | 'sad' | 'surprised') {
    switch (expr) {
      case 'happy':
        this.expressionBoost = { ParamMouthForm: 0.85, ParamEyeLOpen: 0.9, ParamEyeROpen: 0.9 }
        break
      case 'sad':
        this.expressionBoost = {
          ParamMouthForm: -0.2,
          ParamBrowLY: -0.45,
          ParamBrowRY: -0.45,
          ParamAngleY: -4,
        }
        break
      case 'surprised':
        this.expressionBoost = {
          ParamMouthOpenY: 0.55,
          ParamEyeLOpen: 1.15,
          ParamEyeROpen: 1.15,
          ParamBrowLY: 0.4,
          ParamBrowRY: 0.4,
        }
        break
      default:
        this.expressionBoost = {}
    }
  }

  private tick(dt: number) {
    this.baseTime += dt
    this.overlayTime += dt

    const merged: ModelParams = { ...DEFAULT_PARAMS }

    if (this.baseClip) {
      Object.assign(merged, sampleClip(this.baseClip, this.baseTime))
    }

    if (this.overlayClip) {
      Object.assign(merged, sampleClip(this.overlayClip, this.overlayTime))
      if (!this.overlayClip.loop && this.overlayTime >= this.overlayClip.duration) {
        this.overlayClip = null
        this.overlayTime = 0
      }
    }

    // 自動眨眼 2~5 秒
    this.nextBlinkAt -= dt
    if (this.blinkT < 0 && this.nextBlinkAt <= 0) {
      this.blinkT = 0
      this.nextBlinkAt = 2 + Math.random() * 3
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt
      const phase = this.blinkT
      let open = 1
      if (phase < 0.06) open = 1 - phase / 0.06
      else if (phase < 0.12) open = (phase - 0.06) / 0.06
      else {
        this.blinkT = -1
        open = 1
      }
      merged.ParamEyeLOpen = open
      merged.ParamEyeROpen = open
    }

    if (this.mouthOverride != null) {
      merged.ParamMouthOpenY = this.mouthOverride
    }

    Object.assign(merged, this.expressionBoost)

    merged.ParamAngleX += this.dragOffset.x
    merged.ParamAngleY += this.dragOffset.y

    this.params = merged
  }

  private emit() {
    for (const fn of this.listeners) fn(this.getParams())
  }
}

export const animationEngine = new AnimationEngine()
