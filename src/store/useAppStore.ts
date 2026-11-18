import { create } from 'zustand'
import type {
  AppError,
  ExpressionId,
  GeneratedModel,
  GenerationProgress,
  MotionClip,
  PlaybackState,
  QualityCheckResult,
} from '../types'
import { modelGenerator, exportModel3Json } from '../engine/ModelGenerator'
import { animationEngine } from '../engine/AnimationEngine'
import { motionGenerator } from '../engine/MotionGenerator'
import { TALK_MOTION, WAVE_L_MOTION, WAVE_R_MOTION } from '../engine/motions'
import { analyzeImage, loadImageUrl } from '../utils/imageQuality'

interface AppState {
  sourceFile: File | null
  previewUrl: string | null
  previewSize: { width: number; height: number } | null
  quality: QualityCheckResult | null
  cropEnabled: boolean
  regeneratePrompt: string

  model: GeneratedModel | null
  generation: GenerationProgress | null
  generating: boolean

  playback: PlaybackState
  customLibrary: MotionClip[]
  motionSpeed: number
  motionAmplitude: number
  customText: string
  talkText: string
  talkMode: 'text' | 'mic'
  expression: ExpressionId
  waveHand: 'left' | 'right'
  background: string
  showLayers: boolean

  error: AppError | null

  setCropEnabled: (v: boolean) => void
  setRegeneratePrompt: (v: string) => void
  setCustomText: (v: string) => void
  setTalkText: (v: string) => void
  setTalkMode: (v: 'text' | 'mic') => void
  setExpression: (v: ExpressionId) => void
  setWaveHand: (v: 'left' | 'right') => void
  setBackground: (v: string) => void
  setShowLayers: (v: boolean) => void
  setMotionSpeed: (v: number) => void
  setMotionAmplitude: (v: number) => void
  clearError: () => void

  uploadImage: (file: File) => Promise<void>
  clearSource: () => void
  generateModel: () => Promise<void>
  regenerateModel: () => Promise<void>

  play: () => void
  pause: () => void
  stop: () => void
  triggerIdle: () => void
  triggerTalk: () => void
  triggerWave: () => void
  generateCustomMotion: () => void
  playCustomMotion: (clip: MotionClip) => void
  exportModel: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  sourceFile: null,
  previewUrl: null,
  previewSize: null,
  quality: null,
  cropEnabled: false,
  regeneratePrompt: '保持原圖樣貌、服裝與髮型，生成自然可動 Live2D 模型',

  model: null,
  generation: null,
  generating: false,

  playback: 'playing',
  customLibrary: [],
  motionSpeed: 1,
  motionAmplitude: 1,
  customText: '',
  talkText: '你好，很高興認識你！',
  talkMode: 'text',
  expression: 'neutral',
  waveHand: 'right',
  background: '#0f1720',
  showLayers: true,

  error: null,

  setCropEnabled: (v) => set({ cropEnabled: v }),
  setRegeneratePrompt: (v) => set({ regeneratePrompt: v }),
  setCustomText: (v) => set({ customText: v }),
  setTalkText: (v) => set({ talkText: v }),
  setTalkMode: (v) => set({ talkMode: v }),
  setExpression: (v) => {
    animationEngine.setExpression(v)
    set({ expression: v })
  },
  setWaveHand: (v) => set({ waveHand: v }),
  setBackground: (v) => set({ background: v }),
  setShowLayers: (v) => set({ showLayers: v }),
  setMotionSpeed: (v) => set({ motionSpeed: v }),
  setMotionAmplitude: (v) => set({ motionAmplitude: v }),
  clearError: () => set({ error: null }),

  uploadImage: async (file) => {
    set({ error: null })
    try {
      const quality = await analyzeImage(file)
      if (!quality.ok) {
        set({
          error: { title: '圖片無法使用', message: quality.errors.join('；') },
          quality,
        })
        return
      }
      const prev = get().previewUrl
      if (prev) URL.revokeObjectURL(prev)
      const loaded = await loadImageUrl(file)
      set({
        sourceFile: file,
        previewUrl: loaded.url,
        previewSize: { width: loaded.width, height: loaded.height },
        quality,
        model: null,
      })
    } catch (e) {
      set({
        error: {
          title: '上傳失敗',
          message: e instanceof Error ? e.message : '未知錯誤',
        },
      })
    }
  },

  clearSource: () => {
    const prev = get().previewUrl
    if (prev) URL.revokeObjectURL(prev)
    const model = get().model
    if (model?.sourceImageUrl) URL.revokeObjectURL(model.sourceImageUrl)
    set({
      sourceFile: null,
      previewUrl: null,
      previewSize: null,
      quality: null,
      model: null,
      generation: null,
    })
  },

  generateModel: async () => {
    const file = get().sourceFile
    if (!file) {
      set({ error: { title: '尚未上傳', message: '請先上傳全身照' } })
      return
    }
    set({ generating: true, error: null, generation: { stage: 'analyzing', percent: 0, message: '準備中…', etaSeconds: 8 } })
    try {
      const model = await modelGenerator.generate(file, {
        prompt: get().regeneratePrompt,
        onProgress: (generation) => set({ generation }),
      })
      const old = get().model
      if (old?.sourceImageUrl) URL.revokeObjectURL(old.sourceImageUrl)
      set({ model, generating: false })
      animationEngine.setIdle()
      set({ playback: 'playing' })
    } catch (e) {
      set({
        generating: false,
        generation: {
          stage: 'error',
          percent: 0,
          message: e instanceof Error ? e.message : '生成失敗',
          etaSeconds: 0,
        },
        error: {
          title: '模型生成失敗',
          message: e instanceof Error ? e.message : '請稍後重試',
        },
      })
    }
  },

  regenerateModel: async () => {
    await get().generateModel()
  },

  play: () => {
    animationEngine.play()
    set({ playback: 'playing' })
  },
  pause: () => {
    animationEngine.pause()
    set({ playback: 'paused' })
  },
  stop: () => {
    animationEngine.stop()
    set({ playback: 'stopped' })
  },
  triggerIdle: () => {
    animationEngine.setIdle()
    set({ playback: 'playing' })
  },
  triggerTalk: () => {
    const text = get().talkText
    const clip: MotionClip = {
      ...TALK_MOTION,
      id: `talk_${Date.now()}`,
      duration: Math.max(1.2, Math.min(6, text.length * 0.12)),
      loop: false,
    }
    // 依文字長度延伸口型節奏
    const cycles = Math.max(1, Math.round(clip.duration / TALK_MOTION.duration))
    if (cycles > 1) {
      const frames = [...TALK_MOTION.keyframes]
      for (let c = 1; c < cycles; c++) {
        for (const k of TALK_MOTION.keyframes) {
          if (k.time === 0) continue
          frames.push({ time: k.time + TALK_MOTION.duration * c, params: { ...k.params } })
        }
      }
      clip.keyframes = frames
      clip.duration = TALK_MOTION.duration * cycles
    }
    animationEngine.playMotion(clip, true)
    set({ playback: 'playing' })
  },
  triggerWave: () => {
    const clip = get().waveHand === 'left' ? WAVE_L_MOTION : WAVE_R_MOTION
    animationEngine.playMotion(clip, true)
    set({ playback: 'playing' })
  },
  generateCustomMotion: () => {
    try {
      const clip = motionGenerator.generateFromText(get().customText, {
        speed: get().motionSpeed,
        amplitude: get().motionAmplitude,
      })
      const library = [clip, ...get().customLibrary].slice(0, 20)
      set({ customLibrary: library })
      animationEngine.playMotion(clip, true)
      set({ playback: 'playing' })
    } catch (e) {
      set({
        error: {
          title: '動作生成失敗',
          message: e instanceof Error ? e.message : '請調整描述後重試',
        },
      })
    }
  },
  playCustomMotion: (clip) => {
    animationEngine.playMotion(clip, true)
    set({ playback: 'playing' })
  },
  exportModel: () => {
    const model = get().model
    if (!model) {
      set({ error: { title: '無法匯出', message: '請先生成模型' } })
      return
    }
    const json = exportModel3Json(model)
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${model.name}.model3.json`
    a.click()
    URL.revokeObjectURL(url)
  },
}))
