import { UploadPanel } from './components/UploadPanel'
import { ModelPreview } from './components/ModelPreview'
import { ActionPanel } from './components/ActionPanel'
import { ErrorToast } from './components/ErrorToast'
import './App.css'

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <div>
            <h1>Live2D Studio</h1>
            <p>從全身照一鍵生成可互動角色</p>
          </div>
        </div>
        <p className="topbar-note">MVP · 本地處理 · 圖片預設不永久儲存</p>
      </header>

      <main className="layout">
        <div className="left-col">
          <UploadPanel />
          <ModelPreview />
        </div>
        <ActionPanel />
      </main>

      <ErrorToast />
    </div>
  )
}
