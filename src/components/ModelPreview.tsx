import { useEffect, useRef } from 'react'
import { CharacterRenderer } from '../engine/CharacterRenderer'
import { animationEngine } from '../engine/AnimationEngine'
import { useAppStore } from '../store/useAppStore'

export function ModelPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<CharacterRenderer | null>(null)
  const dragging = useRef(false)

  const { model, background, showLayers, generating, generation } = useAppStore()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = new CharacterRenderer(canvas)
    rendererRef.current = renderer
    renderer.setBackground(background)
    renderer.resize()

    const unsub = animationEngine.subscribe((params) => {
      renderer.setParams(params)
    })
    animationEngine.start()

    const onResize = () => renderer.resize()
    window.addEventListener('resize', onResize)
    return () => {
      unsub()
      window.removeEventListener('resize', onResize)
      animationEngine.stopLoop()
    }
  }, [])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    renderer.setBackground(background)
    renderer.draw()
  }, [background])

  useEffect(() => {
    rendererRef.current?.setShowOverlay(showLayers)
  }, [showLayers])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    if (model) {
      void renderer.setModel(model).then(() => {
        renderer.setShowOverlay(showLayers)
      })
    } else {
      renderer.clearModel()
    }
  }, [model])

  return (
    <section className="preview-panel panel">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="eyebrow">預覽</p>
          <h2 className="panel-title">Live2D 角色舞台</h2>
        </div>
        {model && (
          <div className="chip-row">
            <span className="chip">{model.styleHint === 'unknown' ? '自動風格' : model.styleHint}</span>
            <span className="chip" title={model.analysisMethod}>
              已標定 {model.landmarks.length} 點 · {model.layers.length} 圖層
            </span>
          </div>
        )}
      </header>

      <div className="stage">
        <canvas
          ref={canvasRef}
          className="stage-canvas"
          onPointerDown={(e) => {
            dragging.current = true
            ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!dragging.current || !canvasRef.current) return
            const rect = canvasRef.current.getBoundingClientRect()
            const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
            const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1
            animationEngine.setDrag(nx, -ny)
          }}
          onPointerUp={() => {
            dragging.current = false
            animationEngine.setDrag(0, 0)
          }}
          onPointerCancel={() => {
            dragging.current = false
            animationEngine.setDrag(0, 0)
          }}
        />

        {showLayers && model && (
          <div className="layer-legend">
            {model.layers.map((l) => (
              <span key={l.id} style={{ borderColor: l.color, color: l.color }}>
                {l.label}
              </span>
            ))}
          </div>
        )}

        {model?.analysisWarnings?.length ? (
          <div className="stage-warn">
            {model.analysisWarnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        ) : null}

        {generating && generation && (
          <div className="progress-overlay" role="status">
            <div className="progress-card">
              <p className="progress-title">正在生成模型</p>
              <p className="progress-msg">{generation.message}</p>
              <div className="progress-bar">
                <div style={{ width: `${generation.percent}%` }} />
              </div>
              <p className="progress-meta">
                {generation.percent}% · 預估剩餘 {generation.etaSeconds}s
              </p>
            </div>
          </div>
        )}

        {!model && !generating && (
          <div className="stage-hint">生成完成後可拖曳角色微調面向</div>
        )}
      </div>
    </section>
  )
}
