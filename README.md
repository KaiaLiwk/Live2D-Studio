# Live2D Studio

從全身照片生成可互動 Live2D-like 角色的 Web 應用（MVP）。

## 技術棧

- React + TypeScript + Vite
- Tailwind CSS v4
- Zustand
- Canvas 參數化角色渲染（可替換為 Cubism SDK / 外部 AI API）

## 開發

```bash
npm install
npm run dev
```

## MVP 範圍

- 圖片上傳、預覽、品質檢查
- 本地模型生成管線（圖層估算 + 參數綁定 + 進度）
- 待機 / 對話 / 揮手
- 文字描述自訂動作
- 播放控制、表情、背景、model3.json 骨架匯出
- 語音驅動嘴型（麥克風）

## 擴充介面

- `src/engine/ModelGenerator.ts` → `IModelGenerator`
- `src/engine/MotionGenerator.ts` → `IMotionGenerator`
