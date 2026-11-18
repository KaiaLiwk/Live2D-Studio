import type { MotionClip } from '../types'

export const IDLE_MOTION: MotionClip = {
  id: 'idle',
  name: '待機',
  description: '呼吸起伏 + 自然微笑 + 自動眨眼',
  duration: 8,
  loop: true,
  keyframes: [
    { time: 0, params: { ParamBreath: 0, ParamMouthForm: 0.35, ParamBodyAngleX: 0, ParamAngleY: 0 } },
    { time: 1.2, params: { ParamBreath: 0.55, ParamBodyAngleX: 1.5, ParamAngleY: 2 } },
    { time: 2.5, params: { ParamBreath: 0.1, ParamBodyAngleX: -1, ParamAngleY: -1 } },
    { time: 4, params: { ParamBreath: 0.65, ParamBodyAngleX: 1, ParamAngleY: 1.5, ParamMouthForm: 0.4 } },
    { time: 5.5, params: { ParamBreath: 0.15, ParamBodyAngleX: -0.5, ParamAngleY: -2 } },
    { time: 8, params: { ParamBreath: 0, ParamBodyAngleX: 0, ParamAngleY: 0, ParamMouthForm: 0.35 } },
  ],
}

export const TALK_MOTION: MotionClip = {
  id: 'talk',
  name: '對話',
  description: '嘴部開合模擬說話',
  duration: 2.4,
  loop: true,
  keyframes: [
    { time: 0, params: { ParamMouthOpenY: 0.1, ParamMouthForm: 0.2 } },
    { time: 0.12, params: { ParamMouthOpenY: 0.75 } },
    { time: 0.28, params: { ParamMouthOpenY: 0.25 } },
    { time: 0.42, params: { ParamMouthOpenY: 0.9 } },
    { time: 0.58, params: { ParamMouthOpenY: 0.15 } },
    { time: 0.75, params: { ParamMouthOpenY: 0.7 } },
    { time: 0.95, params: { ParamMouthOpenY: 0.35 } },
    { time: 1.15, params: { ParamMouthOpenY: 0.85 } },
    { time: 1.35, params: { ParamMouthOpenY: 0.2 } },
    { time: 1.55, params: { ParamMouthOpenY: 0.65 } },
    { time: 1.8, params: { ParamMouthOpenY: 0.4 } },
    { time: 2.1, params: { ParamMouthOpenY: 0.8 } },
    { time: 2.4, params: { ParamMouthOpenY: 0.1, ParamMouthForm: 0.25 } },
  ],
}

export const WAVE_L_MOTION: MotionClip = {
  id: 'wave_l',
  name: '揮手（左）',
  description: '左手自然揮動',
  duration: 2.2,
  loop: false,
  keyframes: [
    { time: 0, params: { ParamArmL: 0, ParamAngleX: 0 } },
    { time: 0.25, params: { ParamArmL: 55, ParamAngleX: -4 } },
    { time: 0.55, params: { ParamArmL: 25 } },
    { time: 0.85, params: { ParamArmL: 60 } },
    { time: 1.15, params: { ParamArmL: 20 } },
    { time: 1.45, params: { ParamArmL: 55 } },
    { time: 1.85, params: { ParamArmL: 15, ParamAngleX: -2 } },
    { time: 2.2, params: { ParamArmL: 0, ParamAngleX: 0 } },
  ],
}

export const WAVE_R_MOTION: MotionClip = {
  id: 'wave_r',
  name: '揮手（右）',
  description: '右手自然揮動',
  duration: 2.2,
  loop: false,
  keyframes: [
    { time: 0, params: { ParamArmR: 0, ParamAngleX: 0 } },
    { time: 0.25, params: { ParamArmR: -55, ParamAngleX: 4 } },
    { time: 0.55, params: { ParamArmR: -25 } },
    { time: 0.85, params: { ParamArmR: -60 } },
    { time: 1.15, params: { ParamArmR: -20 } },
    { time: 1.45, params: { ParamArmR: -55 } },
    { time: 1.85, params: { ParamArmR: -15, ParamAngleX: 2 } },
    { time: 2.2, params: { ParamArmR: 0, ParamAngleX: 0 } },
  ],
}

export const BUILTIN_MOTIONS = [IDLE_MOTION, TALK_MOTION, WAVE_L_MOTION, WAVE_R_MOTION]
