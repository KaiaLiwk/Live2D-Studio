import { useCallback, useRef, useState } from 'react'
import { ImagePlus, Trash2, Scissors, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export function UploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const {
    previewUrl,
    previewSize,
    quality,
    cropEnabled,
    setCropEnabled,
    uploadImage,
    clearSource,
    generating,
  } = useAppStore()

  const onFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0]
      if (!file) return
      await uploadImage(file)
    },
    [uploadImage],
  )

  return (
    <section className="panel flex flex-col gap-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">步驟 01</p>
          <h2 className="panel-title">上傳全身照</h2>
        </div>
        {previewUrl && (
          <button type="button" className="btn-ghost" onClick={clearSource} disabled={generating}>
            <Trash2 size={16} />
            清除
          </button>
        )}
      </header>

      <div
        className={`upload-zone ${dragging ? 'is-drag' : ''} ${previewUrl ? 'has-preview' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void onFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void onFiles(e.target.files)}
        />

        {previewUrl ? (
          <div className="preview-wrap">
            <img src={previewUrl} alt="上傳預覽" className={cropEnabled ? 'crop-mode' : ''} />
            {cropEnabled && <div className="crop-frame" aria-hidden />}
          </div>
        ) : (
          <div className="upload-empty">
            <div className="upload-icon">
              <ImagePlus size={28} />
            </div>
            <p className="upload-main">拖曳或點選上傳</p>
            <p className="upload-sub">JPG / PNG / WEBP · 建議 ≥ 1024px · 最大 10MB</p>
          </div>
        )}
      </div>

      {previewSize && (
        <p className="meta-line">
          {previewSize.width} × {previewSize.height}px
        </p>
      )}

      <label className="check-row">
        <input
          type="checkbox"
          checked={cropEnabled}
          onChange={(e) => setCropEnabled(e.target.checked)}
        />
        <Scissors size={15} />
        啟用簡單裁切導引（置中全身）
      </label>

      {quality && (
        <div className={`quality-box ${quality.ok ? 'ok' : 'bad'}`}>
          <div className="quality-head">
            {quality.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>品質分數 {(quality.score * 100).toFixed(0)}</span>
          </div>
          {quality.errors.map((m) => (
            <p key={m} className="quality-err">
              {m}
            </p>
          ))}
          {quality.warnings.map((m) => (
            <p key={m} className="quality-warn">
              {m}
            </p>
          ))}
          {quality.ok && quality.warnings.length === 0 && (
            <p className="quality-ok">圖片看起來適合生成全身模型</p>
          )}
        </div>
      )}
    </section>
  )
}
