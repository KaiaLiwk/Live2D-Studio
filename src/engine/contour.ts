export type NormPoint = [number, number]

/** Moore 鄰域邊界追蹤：從二值遮罩取出封閉輪廓（影像座標） */
export function traceContour(
  mask: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
): Array<[number, number]> {
  // 8-connected Moore neighborhood, clockwise from west
  const dx = [-1, -1, 0, 1, 1, 1, 0, -1]
  const dy = [0, -1, -1, -1, 0, 1, 1, 1]

  const at = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0
    return mask[y * width + x]
  }

  const points: Array<[number, number]> = []
  let x = startX
  let y = startY
  let dir = 0 // come from west initially
  const maxSteps = width * height
  const firstKey = `${x},${y}`

  for (let step = 0; step < maxSteps; step++) {
    points.push([x, y])
    let found = false
    // start search from dir+6 (prefer left-turn) then clockwise
    for (let i = 0; i < 8; i++) {
      const nd = (dir + 6 + i) % 8
      const nx = x + dx[nd]
      const ny = y + dy[nd]
      if (at(nx, ny)) {
        x = nx
        y = ny
        dir = nd
        found = true
        break
      }
    }
    if (!found) break
    if (step > 8 && `${x},${y}` === firstKey) break
  }

  return points
}

/** 在 ROI 內找第一個前景邊界點並追蹤最大輪廓 */
export function extractLargestContourInRoi(
  alpha: Uint8ClampedArray,
  imgW: number,
  imgH: number,
  roi: [number, number, number, number],
  alphaThreshold = 40,
): Array<[number, number]> | null {
  const [rx, ry, rw, rh] = roi
  const x0 = Math.max(0, Math.floor(rx * imgW))
  const y0 = Math.max(0, Math.floor(ry * imgH))
  const x1 = Math.min(imgW, Math.ceil((rx + rw) * imgW))
  const y1 = Math.min(imgH, Math.ceil((ry + rh) * imgH))
  const bw = Math.max(1, x1 - x0)
  const bh = Math.max(1, y1 - y0)

  const mask = new Uint8Array(bw * bh)
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const a = alpha[((y0 + y) * imgW + (x0 + x)) * 4 + 3]
      mask[y * bw + x] = a >= alphaThreshold ? 1 : 0
    }
  }

  // 找邊界種子：前景且鄰近背景
  let best: Array<[number, number]> | null = null
  const visited = new Uint8Array(bw * bh)

  for (let y = 1; y < bh - 1; y++) {
    for (let x = 1; x < bw - 1; x++) {
      const i = y * bw + x
      if (!mask[i] || visited[i]) continue
      const border =
        !mask[i - 1] || !mask[i + 1] || !mask[i - bw] || !mask[i + bw]
      if (!border) continue

      const local = traceContour(mask, bw, bh, x, y)
      for (const [lx, ly] of local) {
        if (lx >= 0 && ly >= 0 && lx < bw && ly < bh) visited[ly * bw + lx] = 1
      }
      if (!best || local.length > best.length) best = local
    }
  }

  if (!best || best.length < 8) {
    // fallback：ROI 橢圓
    return ellipseContour(rx + rw / 2, ry + rh / 2, rw * 0.42, rh * 0.42, 24)
  }

  // 轉回正規化座標並簡化
  const norm: NormPoint[] = best.map(([x, y]) => [
    (x0 + x) / imgW,
    (y0 + y) / imgH,
  ])
  return simplifyPolyline(norm, 0.0025)
}

/** Ramer–Douglas–Peucker 簡化 */
export function simplifyPolyline(points: NormPoint[], epsilon: number): NormPoint[] {
  if (points.length < 3) return points

  const sq = (a: NormPoint, b: NormPoint) => {
    const dx = a[0] - b[0]
    const dy = a[1] - b[1]
    return dx * dx + dy * dy
  }
  const segDist = (p: NormPoint, a: NormPoint, b: NormPoint) => {
    const l2 = sq(a, b)
    if (l2 === 0) return sq(p, a)
    let t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l2
    t = Math.max(0, Math.min(1, t))
    return sq(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
  }

  const rec = (pts: NormPoint[]): NormPoint[] => {
    if (pts.length < 3) return pts
    let maxD = 0
    let idx = 0
    const end = pts.length - 1
    for (let i = 1; i < end; i++) {
      const d = segDist(pts[i], pts[0], pts[end])
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (maxD > epsilon * epsilon) {
      const left = rec(pts.slice(0, idx + 1))
      const right = rec(pts.slice(idx))
      return left.slice(0, -1).concat(right)
    }
    return [pts[0], pts[end]]
  }

  return rec(points)
}

export function ellipseContour(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n = 28,
): NormPoint[] {
  const pts: NormPoint[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
  }
  return pts
}

/** 由折線點列建立正規化外接矩形 */
export function boundsOfContour(contour: NormPoint[]): [number, number, number, number] {
  let minX = 1
  let minY = 1
  let maxX = 0
  let maxY = 0
  for (const [x, y] of contour) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return [minX, minY, Math.max(0.01, maxX - minX), Math.max(0.01, maxY - minY)]
}

/** MediaPipe 索引折線 → 正規化輪廓 */
export function contourFromIndices(
  facePts: Array<{ x: number; y: number }>,
  indices: number[],
  closed = true,
): NormPoint[] {
  const pts: NormPoint[] = indices
    .map((i) => facePts[i])
    .filter(Boolean)
    .map((p) => [p.x, p.y] as NormPoint)
  if (closed && pts.length > 2) {
    const first = pts[0]
    const last = pts[pts.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) pts.push([first[0], first[1]])
  }
  return simplifyPolyline(pts, 0.0015)
}
