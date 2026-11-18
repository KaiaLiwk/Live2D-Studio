import {
  Download,
  Hand,
  MessageSquare,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Square,
  Waves,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { animationEngine } from '../engine/AnimationEngine'
import { useAppStore } from '../store/useAppStore'

const EXPRESSIONS = [
  { id: 'neutral' as const, label: '中性' },
  { id: 'happy' as const, label: '開心' },
  { id: 'sad' as const, label: '悲傷' },
  { id: 'surprised' as const, label: '驚訝' },
]

const BACKGROUNDS = [
  { id: '#0f1720', label: '深夜' },
  { id: '#1a2330', label: '霧藍' },
  { id: '#243028', label: '森綠' },
  { id: '#2a2420', label: '暖褐' },
  { id: '#f2efe8', label: '亮紙' },
]

export function ActionPanel() {
  const micRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef(0)

  const {
    sourceFile,
    model,
    generating,
    regeneratePrompt,
    setRegeneratePrompt,
    generateModel,
    regenerateModel,
    playback,
    play,
    pause,
    stop,
    triggerIdle,
    triggerTalk,
    triggerWave,
    talkText,
    setTalkText,
    talkMode,
    setTalkMode,
    waveHand,
    setWaveHand,
    expression,
    setExpression,
    background,
    setBackground,
    showLayers,
    setShowLayers,
    customText,
    setCustomText,
    motionSpeed,
    setMotionSpeed,
    motionAmplitude,
    setMotionAmplitude,
    generateCustomMotion,
    customLibrary,
    playCustomMotion,
    exportModel,
  } = useAppStore()

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      animationEngine.setMouthOverride(null)
    }
  }, [])

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      micRef.current = analyser
      const data = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        animationEngine.setMouthOverride(Math.min(1, rms * 4.5))
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
      setTalkMode('mic')
    } catch {
      useAppStore.setState({
        error: { title: '麥克風無法使用', message: '請允許瀏覽器麥克風權限後重試' },
      })
    }
  }

  const stopMic = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    micRef.current = null
    animationEngine.setMouthOverride(null)
    setTalkMode('text')
  }

  return (
    <aside className="action-panel panel flex flex-col gap-5">
      <header>
        <p className="eyebrow">步驟 02–04</p>
        <h2 className="panel-title">生成與動作控制</h2>
      </header>

      <div className="block">
        <label className="field-label">生成提示詞（可微調後重新生成）</label>
        <textarea
          className="field"
          rows={2}
          value={regeneratePrompt}
          onChange={(e) => setRegeneratePrompt(e.target.value)}
          placeholder="描述希望保留的樣貌、服裝細節…"
        />
        <div className="btn-row">
          <button
            type="button"
            className="btn-primary"
            disabled={!sourceFile || generating}
            onClick={() => void generateModel()}
          >
            <Sparkles size={16} />
            {model ? '重新生成' : '生成 Live2D 模型'}
          </button>
          {model && (
            <button
              type="button"
              className="btn-secondary"
              disabled={generating}
              onClick={() => void regenerateModel()}
              title="使用目前提示詞再跑一次"
            >
              <RefreshCw size={16} />
            </button>
          )}
          <button type="button" className="btn-secondary" disabled={!model} onClick={exportModel}>
            <Download size={16} />
            匯出
          </button>
        </div>
      </div>

      <div className="block">
        <p className="field-label">播放控制</p>
        <div className="btn-row">
          <button type="button" className="btn-secondary" onClick={play} disabled={playback === 'playing'}>
            <Play size={16} />
            播放
          </button>
          <button type="button" className="btn-secondary" onClick={pause} disabled={playback !== 'playing'}>
            <Pause size={16} />
            暫停
          </button>
          <button type="button" className="btn-secondary" onClick={stop}>
            <Square size={16} />
            停止
          </button>
        </div>
      </div>

      <div className="block">
        <p className="field-label">內建動作</p>
        <div className="btn-row wrap">
          <button type="button" className="btn-secondary" disabled={!model} onClick={triggerIdle}>
            <Waves size={16} />
            待機
          </button>
          <button type="button" className="btn-secondary" disabled={!model} onClick={triggerTalk}>
            <MessageSquare size={16} />
            對話
          </button>
          <button type="button" className="btn-secondary" disabled={!model} onClick={triggerWave}>
            <Hand size={16} />
            揮手
          </button>
        </div>
        <div className="inline-opts">
          <label>
            揮手
            <select value={waveHand} onChange={(e) => setWaveHand(e.target.value as 'left' | 'right')}>
              <option value="right">右手</option>
              <option value="left">左手</option>
            </select>
          </label>
        </div>
        <label className="field-label mt-3">對話文字（文字驅動嘴型）</label>
        <textarea
          className="field"
          rows={2}
          value={talkText}
          onChange={(e) => setTalkText(e.target.value)}
        />
        <div className="btn-row">
          {talkMode === 'mic' ? (
            <button type="button" className="btn-secondary danger" onClick={stopMic}>
              <Mic size={16} />
              停止語音驅動
            </button>
          ) : (
            <button type="button" className="btn-secondary" onClick={() => void startMic()}>
              <Mic size={16} />
              語音驅動嘴巴
            </button>
          )}
        </div>
      </div>

      <div className="block">
        <p className="field-label">自訂動作（文字描述）</p>
        <textarea
          className="field"
          rows={2}
          placeholder="例如：向右揮手兩次、雙手比愛心、輕輕點頭…"
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
        />
        <div className="sliders">
          <label>
            速度 {motionSpeed.toFixed(1)}x
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={motionSpeed}
              onChange={(e) => setMotionSpeed(Number(e.target.value))}
            />
          </label>
          <label>
            幅度 {motionAmplitude.toFixed(1)}
            <input
              type="range"
              min={0.5}
              max={1.8}
              step={0.1}
              value={motionAmplitude}
              onChange={(e) => setMotionAmplitude(Number(e.target.value))}
            />
          </label>
        </div>
        <button
          type="button"
          className="btn-primary w-full"
          disabled={!model || !customText.trim()}
          onClick={generateCustomMotion}
        >
          生成並播放動作
        </button>
        {customLibrary.length > 0 && (
          <div className="library">
            <p className="field-label">動作庫</p>
            <ul>
              {customLibrary.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => playCustomMotion(c)}>
                    <span>{c.name}</span>
                    <small>{c.description}</small>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="block">
        <p className="field-label">表情</p>
        <div className="chip-row">
          {EXPRESSIONS.map((e) => (
            <button
              key={e.id}
              type="button"
              className={`chip-btn ${expression === e.id ? 'active' : ''}`}
              onClick={() => setExpression(e.id)}
              disabled={!model}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      <div className="block">
        <p className="field-label">背景</p>
        <div className="chip-row">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`swatch ${background === b.id ? 'active' : ''}`}
              style={{ background: b.id }}
              title={b.label}
              onClick={() => setBackground(b.id)}
            />
          ))}
        </div>
        <label className="check-row mt-3">
          <input
            type="checkbox"
            checked={showLayers}
            onChange={(e) => setShowLayers(e.target.checked)}
          />
          顯示沿邊輪廓標定（五官／肢體）
        </label>
      </div>
    </aside>
  )
}
