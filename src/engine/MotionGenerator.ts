import type { MotionClip, ModelParams } from '../types'

/**
 * 自然語言 → Live2D 參數時間軸。
 * MVP：規則匹配 + 可擴充 LLM 介面。
 */
export interface IMotionGenerator {
  generateFromText(text: string, options?: { speed?: number; amplitude?: number }): MotionClip
}

type Template = {
  keywords: string[]
  name: string
  build: (amp: number) => MotionClip['keyframes']
  duration: number
}

const TEMPLATES: Template[] = [
  {
    keywords: ['揮手', '招手', 'wave'],
    name: '揮手',
    duration: 2.2,
    build: (amp) => {
      const a = 50 * amp
      const right = true
      return [
        { time: 0, params: { ParamArmR: 0 } },
        { time: 0.3, params: { ParamArmR: -a } },
        { time: 0.6, params: { ParamArmR: -a * 0.4 } },
        { time: 0.9, params: { ParamArmR: -a } },
        { time: 1.3, params: { ParamArmR: -a * 0.35 } },
        { time: 1.7, params: { ParamArmR: -a * 0.9 } },
        { time: 2.2, params: { ParamArmR: 0 } },
      ].map((k) => (right ? k : { ...k, params: { ParamArmL: -(k.params.ParamArmR ?? 0) } }))
    },
  },
  {
    keywords: ['向右揮', '右手揮'],
    name: '向右揮手',
    duration: 2.4,
    build: (amp) => {
      const a = 55 * amp
      const times = [0, 0.35, 0.7, 1.05, 1.4, 1.85, 2.4]
      const vals = [0, -a, -a * 0.35, -a, -a * 0.3, -a * 0.85, 0]
      return times.map((time, i) => ({ time, params: { ParamArmR: vals[i] } }))
    },
  },
  {
    keywords: ['向左揮', '左手揮'],
    name: '向左揮手',
    duration: 2.4,
    build: (amp) => {
      const a = 55 * amp
      const times = [0, 0.35, 0.7, 1.05, 1.4, 1.85, 2.4]
      const vals = [0, a, a * 0.35, a, a * 0.3, a * 0.85, 0]
      return times.map((time, i) => ({ time, params: { ParamArmL: vals[i] } }))
    },
  },
  {
    keywords: ['點頭', '同意', 'nod'],
    name: '點頭',
    duration: 1.6,
    build: (amp) => {
      const a = 12 * amp
      return [
        { time: 0, params: { ParamAngleY: 0 } },
        { time: 0.25, params: { ParamAngleY: -a } },
        { time: 0.5, params: { ParamAngleY: 2 } },
        { time: 0.8, params: { ParamAngleY: -a * 0.85 } },
        { time: 1.1, params: { ParamAngleY: 1 } },
        { time: 1.6, params: { ParamAngleY: 0 } },
      ]
    },
  },
  {
    keywords: ['搖頭', '拒絕'],
    name: '搖頭',
    duration: 1.8,
    build: (amp) => {
      const a = 14 * amp
      return [
        { time: 0, params: { ParamAngleX: 0 } },
        { time: 0.3, params: { ParamAngleX: -a } },
        { time: 0.6, params: { ParamAngleX: a } },
        { time: 0.95, params: { ParamAngleX: -a * 0.8 } },
        { time: 1.3, params: { ParamAngleX: a * 0.6 } },
        { time: 1.8, params: { ParamAngleX: 0 } },
      ]
    },
  },
  {
    keywords: ['跳', '開心跳', 'bounce'],
    name: '開心跳躍',
    duration: 1.8,
    build: (amp) => [
      { time: 0, params: { ParamBreath: 0, ParamMouthForm: 0.4, ParamArmL: 0, ParamArmR: 0 } },
      {
        time: 0.35,
        params: {
          ParamBreath: 1.2 * amp,
          ParamMouthForm: 0.8,
          ParamArmL: 25 * amp,
          ParamArmR: -25 * amp,
        },
      },
      { time: 0.7, params: { ParamBreath: 0.1, ParamArmL: 5, ParamArmR: -5 } },
      {
        time: 1.1,
        params: {
          ParamBreath: 1 * amp,
          ParamMouthForm: 0.75,
          ParamArmL: 30 * amp,
          ParamArmR: -30 * amp,
        },
      },
      { time: 1.8, params: { ParamBreath: 0, ParamMouthForm: 0.4, ParamArmL: 0, ParamArmR: 0 } },
    ],
  },
  {
    keywords: ['愛心', '比心'],
    name: '雙手比愛心',
    duration: 2.5,
    build: (amp) => [
      { time: 0, params: { ParamArmL: 0, ParamArmR: 0, ParamMouthForm: 0.3 } },
      {
        time: 0.5,
        params: {
          ParamArmL: 40 * amp,
          ParamArmR: -40 * amp,
          ParamMouthForm: 0.7,
          ParamAngleY: -4,
        },
      },
      {
        time: 1.4,
        params: {
          ParamArmL: 45 * amp,
          ParamArmR: -45 * amp,
          ParamMouthForm: 0.85,
          ParamEyeLOpen: 0.85,
          ParamEyeROpen: 0.85,
        },
      },
      { time: 2.5, params: { ParamArmL: 0, ParamArmR: 0, ParamMouthForm: 0.35, ParamAngleY: 0 } },
    ],
  },
  {
    keywords: ['思考', '低頭'],
    name: '低頭思考',
    duration: 3,
    build: (amp) => [
      { time: 0, params: { ParamAngleY: 0, ParamAngleX: 0, ParamBrowLY: 0 } },
      {
        time: 0.6,
        params: {
          ParamAngleY: -10 * amp,
          ParamAngleX: 6 * amp,
          ParamBrowLY: -0.3,
          ParamBrowRY: -0.3,
          ParamMouthForm: 0.1,
        },
      },
      { time: 2.2, params: { ParamAngleY: -12 * amp, ParamAngleX: 8 * amp, ParamBreath: 0.3 } },
      { time: 3, params: { ParamAngleY: 0, ParamAngleX: 0, ParamBrowLY: 0, ParamBrowRY: 0 } },
    ],
  },
  {
    keywords: ['鼓掌', '拍手'],
    name: '開心鼓掌',
    duration: 2,
    build: (amp) => {
      const a = 35 * amp
      return [
        { time: 0, params: { ParamArmL: 0, ParamArmR: 0, ParamMouthForm: 0.5 } },
        { time: 0.25, params: { ParamArmL: a, ParamArmR: -a } },
        { time: 0.45, params: { ParamArmL: a * 0.4, ParamArmR: -a * 0.4 } },
        { time: 0.65, params: { ParamArmL: a, ParamArmR: -a } },
        { time: 0.85, params: { ParamArmL: a * 0.4, ParamArmR: -a * 0.4 } },
        { time: 1.1, params: { ParamArmL: a, ParamArmR: -a, ParamMouthForm: 0.7 } },
        { time: 1.4, params: { ParamArmL: a * 0.35, ParamArmR: -a * 0.35 } },
        { time: 2, params: { ParamArmL: 0, ParamArmR: 0, ParamMouthForm: 0.4 } },
      ]
    },
  },
  {
    keywords: ['害羞', '捂臉'],
    name: '害羞捂臉',
    duration: 2.8,
    build: (amp) => [
      { time: 0, params: { ParamArmL: 0, ParamArmR: 0, ParamAngleY: 0, ParamMouthForm: 0.3 } },
      {
        time: 0.5,
        params: {
          ParamArmR: -50 * amp,
          ParamAngleY: 8 * amp,
          ParamAngleX: -6 * amp,
          ParamMouthForm: 0.55,
          ParamEyeLOpen: 0.7,
          ParamEyeROpen: 0.7,
        },
      },
      { time: 1.8, params: { ParamArmR: -55 * amp, ParamBreath: 0.4 } },
      {
        time: 2.8,
        params: {
          ParamArmR: 0,
          ParamAngleY: 0,
          ParamAngleX: 0,
          ParamMouthForm: 0.35,
          ParamEyeLOpen: 1,
          ParamEyeROpen: 1,
        },
      },
    ],
  },
]

function scaleDuration(clip: MotionClip, speed: number): MotionClip {
  const s = Math.max(0.35, Math.min(2.5, speed))
  return {
    ...clip,
    duration: clip.duration / s,
    speed: s,
    keyframes: clip.keyframes.map((k) => ({ ...k, time: k.time / s })),
  }
}

export class RuleMotionGenerator implements IMotionGenerator {
  generateFromText(text: string, options?: { speed?: number; amplitude?: number }): MotionClip {
    const raw = text.trim()
    if (!raw) {
      throw new Error('請輸入動作描述')
    }

    const amp = options?.amplitude ?? 1
    const speed = options?.speed ?? 1
    const lower = raw.toLowerCase()

    let matched = TEMPLATES.find((t) => t.keywords.some((k) => lower.includes(k.toLowerCase())))

    // 「兩次」類重複：簡單加倍中段
    const twice = /兩次|两次|2次|兩回/.test(raw)

    if (!matched) {
      // 通用情緒動作 fallback
      matched = {
        keywords: [],
        name: '自訂動作',
        duration: 2.2,
        build: (a) => [
          { time: 0, params: { ParamAngleX: 0, ParamBreath: 0, ParamMouthForm: 0.35 } },
          {
            time: 0.5,
            params: {
              ParamAngleX: 8 * a,
              ParamBreath: 0.6 * a,
              ParamMouthForm: 0.6,
              ParamArmL: 15 * a,
              ParamArmR: -15 * a,
            },
          },
          { time: 1.2, params: { ParamAngleX: -6 * a, ParamBreath: 0.2 } },
          { time: 2.2, params: { ParamAngleX: 0, ParamBreath: 0, ParamArmL: 0, ParamArmR: 0 } },
        ],
      }
    }

    let keyframes = matched.build(amp)
    let duration = matched.duration

    if (twice) {
      const mid = keyframes.slice(1, -1).map((k) => ({
        ...k,
        time: k.time + duration * 0.55,
        params: { ...k.params } as Partial<ModelParams>,
      }))
      const end = keyframes[keyframes.length - 1]
      keyframes = [
        ...keyframes.slice(0, -1),
        ...mid,
        { ...end, time: duration * 1.55 },
      ]
      duration *= 1.55
    }

    const clip: MotionClip = {
      id: `custom_${Date.now()}`,
      name: matched.name,
      description: raw,
      duration,
      loop: false,
      amplitude: amp,
      keyframes,
    }

    return scaleDuration(clip, speed)
  }
}

export const motionGenerator: IMotionGenerator = new RuleMotionGenerator()
