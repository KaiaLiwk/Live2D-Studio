import { DEFAULT_PARAMS, type GeneratedModel, type GenerationProgress } from '../types'
import { guessStyle } from './layerLayout'
import { analyzePerson } from './PersonAnalyzer'
import { analyzeImage } from '../utils/imageQuality'

/**
 * Live2D 生成服務介面 — 方便後續替換成真實 AI / 外部 API。
 */
export interface IModelGenerator {
  generate(
    file: File,
    options?: { prompt?: string; onProgress?: (p: GenerationProgress) => void },
  ): Promise<GeneratedModel>
}

function report(
  onProgress: ((p: GenerationProgress) => void) | undefined,
  stage: GenerationProgress['stage'],
  percent: number,
  message: string,
  etaSeconds: number,
) {
  onProgress?.({ stage, percent, message, etaSeconds })
}

export class LocalModelGenerator implements IModelGenerator {
  async generate(
    file: File,
    options?: { prompt?: string; onProgress?: (p: GenerationProgress) => void },
  ): Promise<GeneratedModel> {
    const onProgress = options?.onProgress
    const started = performance.now()

    report(onProgress, 'analyzing', 3, '檢查圖片品質…', 25)
    const quality = await analyzeImage(file)
    if (!quality.ok) {
      report(onProgress, 'error', 0, quality.errors[0] ?? '圖片不符合要求', 0)
      throw new Error(quality.errors.join('；') || '圖片品質檢查失敗')
    }

    const analysis = await analyzePerson(file, (message, percent) => {
      const stage: GenerationProgress['stage'] =
        percent < 60 ? 'segmenting' : percent < 90 ? 'meshing' : 'binding'
      const elapsed = (performance.now() - started) / 1000
      const remain = percent > 5 ? Math.max(1, Math.round((elapsed / percent) * (100 - percent))) : 20
      report(onProgress, stage, Math.min(95, percent), message, remain)
    })

    report(onProgress, 'binding', 96, '綁定 Live2D 參數…', 2)
    await new Promise((r) => setTimeout(r, 200))
    report(onProgress, 'finalizing', 99, '輸出模型預覽…', 1)

    const sourceUrl = URL.createObjectURL(file)
    const styleHint = guessStyle(file.name, analysis.sourceHeight / analysis.sourceWidth)

    report(onProgress, 'done', 100, '模型生成完成', 0)

    return {
      id: `model_${Date.now()}`,
      name: file.name.replace(/\.[^.]+$/, '') || '未命名角色',
      createdAt: Date.now(),
      imageUrl: analysis.cutoutUrl,
      baseImageUrl: analysis.baseUrl,
      sourceImageUrl: sourceUrl,
      imageWidth: analysis.sourceWidth,
      imageHeight: analysis.sourceHeight,
      layers: analysis.layers,
      landmarks: analysis.landmarks,
      personBounds: analysis.personBounds,
      analysisMethod: analysis.method,
      analysisWarnings: analysis.warnings,
      params: { ...DEFAULT_PARAMS },
      styleHint,
      prompt: options?.prompt,
    }
  }
}

/** 匯出近似 Cubism 的 model3.json 結構（MVP 相容骨架） */
export function exportModel3Json(model: GeneratedModel) {
  return {
    Version: 3,
    FileReferences: {
      Moc: `${model.name}.moc3`,
      Textures: [`${model.name}.png`],
      Physics: `${model.name}.physics3.json`,
      Motions: {
        Idle: [{ File: 'motions/idle.motion3.json' }],
        Talk: [{ File: 'motions/talk.motion3.json' }],
        Wave: [{ File: 'motions/wave.motion3.json' }],
      },
    },
    Groups: [
      {
        Target: 'Parameter',
        Name: 'EyeBlink',
        Ids: ['ParamEyeLOpen', 'ParamEyeROpen'],
      },
      {
        Target: 'Parameter',
        Name: 'LipSync',
        Ids: ['ParamMouthOpenY'],
      },
    ],
    HitAreas: [],
    Meta: {
      generator: 'Live2D Character Studio MVP',
      createdAt: new Date(model.createdAt).toISOString(),
      styleHint: model.styleHint,
      analysisMethod: model.analysisMethod,
      personBounds: model.personBounds,
      layers: model.layers.map((l) => ({ id: l.id, label: l.label, rect: l.rect })),
      landmarks: model.landmarks,
      note: '此為可擴充匯出骨架；完整 .moc3 需接真實 Live2D 網格管線或商業 API。',
    },
  }
}

export const modelGenerator: IModelGenerator = new LocalModelGenerator()
