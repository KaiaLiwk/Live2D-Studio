/** Live2D-like 參數（可對應 Cubism 常用參數命名） */
export interface ModelParams {
  ParamAngleX: number
  ParamAngleY: number
  ParamBodyAngleX: number
  ParamBreath: number
  ParamEyeLOpen: number
  ParamEyeROpen: number
  ParamMouthOpenY: number
  ParamMouthForm: number
  ParamArmL: number
  ParamArmR: number
  ParamBrowLY: number
  ParamBrowRY: number
}

export type ParamId = keyof ModelParams

export const DEFAULT_PARAMS: ModelParams = {
  ParamAngleX: 0,
  ParamAngleY: 0,
  ParamBodyAngleX: 0,
  ParamBreath: 0,
  ParamEyeLOpen: 1,
  ParamEyeROpen: 1,
  ParamMouthOpenY: 0,
  ParamMouthForm: 0.35,
  ParamArmL: 0,
  ParamArmR: 0,
  ParamBrowLY: 0,
  ParamBrowRY: 0,
}

export interface Keyframe {
  time: number
  params: Partial<ModelParams>
}

export interface MotionClip {
  id: string
  name: string
  description?: string
  duration: number
  loop: boolean
  keyframes: Keyframe[]
  speed?: number
  amplitude?: number
}

export type PlaybackState = 'playing' | 'paused' | 'stopped'

export type GenerationStage =
  | 'idle'
  | 'analyzing'
  | 'segmenting'
  | 'meshing'
  | 'binding'
  | 'finalizing'
  | 'done'
  | 'error'

export interface GenerationProgress {
  stage: GenerationStage
  percent: number
  message: string
  etaSeconds: number
}

export interface BodyPartRegion {
  id: string
  label: string
  /** 相對整圖的正規化矩形 [x, y, w, h]，範圍 0~1（外接框，僅輔助） */
  rect: [number, number, number, number]
  /** 沿目標邊緣的正規化輪廓點 */
  contour?: Array<[number, number]>
  pivot?: [number, number]
  color?: string
  /** 可動部位獨立貼圖（已沿輪廓裁切） */
  spriteUrl?: string
  spriteRect?: [number, number, number, number]
}

export interface LandmarkPoint {
  id: string
  label: string
  /** 正規化座標 0~1 */
  x: number
  y: number
  group: 'face' | 'pose' | 'part'
}

export interface GeneratedModel {
  id: string
  name: string
  createdAt: number
  /** 完整去背人物（參考用） */
  imageUrl: string
  /** 已挖空可動部位的底圖（渲染主體，避免動作殘影） */
  baseImageUrl: string
  /** 原始上傳圖（若有） */
  sourceImageUrl?: string
  imageWidth: number
  imageHeight: number
  layers: BodyPartRegion[]
  landmarks: LandmarkPoint[]
  personBounds: [number, number, number, number]
  analysisMethod: string
  analysisWarnings: string[]
  params: ModelParams
  styleHint: 'realistic' | 'anime' | 'chibi' | 'mascot' | 'unknown'
  prompt?: string
}

export interface QualityCheckResult {
  ok: boolean
  warnings: string[]
  errors: string[]
  score: number
}

export interface AppError {
  title: string
  message: string
}

export type ExpressionId = 'neutral' | 'happy' | 'sad' | 'surprised'
