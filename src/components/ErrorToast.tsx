import { X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

export function ErrorToast() {
  const error = useAppStore((s) => s.error)
  const clearError = useAppStore((s) => s.clearError)
  if (!error) return null

  return (
    <div className="toast" role="alert">
      <div>
        <strong>{error.title}</strong>
        <p>{error.message}</p>
      </div>
      <button type="button" className="btn-ghost" onClick={clearError} aria-label="關閉">
        <X size={16} />
      </button>
    </div>
  )
}
