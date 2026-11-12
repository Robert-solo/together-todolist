import { useEffect, useRef, useState } from 'react'
import s from './AvatarCropper.module.css'

const VIEW = 280   // on-screen crop square
const OUT = 256    // exported pixels

interface Props {
  file: File
  onCancel: () => void
  onDone: (dataUrl: string) => void
}

export function AvatarCropper({ file, onCancel, onDone }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [err, setErr] = useState('')
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const im = new Image()
    im.onload = () => {
      setImg(im)
      const base = Math.max(VIEW / im.naturalWidth, VIEW / im.naturalHeight)
      setPos({ x: (VIEW - im.naturalWidth * base) / 2, y: (VIEW - im.naturalHeight * base) / 2 })
    }
    im.onerror = () => setErr('无法读取这张图片')
    im.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const base = img ? Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight) : 1
  const scale = base * zoom

  const clamp = (x: number, y: number, sc = scale) => {
    if (!img) return { x, y }
    return {
      x: Math.min(0, Math.max(VIEW - img.naturalWidth * sc, x)),
      y: Math.min(0, Math.max(VIEW - img.naturalHeight * sc, y)),
    }
  }

  const changeZoom = (z: number) => {
    if (!img) return
    const ns = base * z
    // keep the viewport centre fixed while zooming
    const cx = (VIEW / 2 - pos.x) / scale
    const cy = (VIEW / 2 - pos.y) / scale
    setZoom(z)
    setPos(clamp(VIEW / 2 - cx * ns, VIEW / 2 - cy * ns, ns))
  }

  const confirm = () => {
    if (!img) return
    const c = document.createElement('canvas')
    c.width = c.height = OUT
    const ctx = c.getContext('2d')!
    const f = OUT / VIEW
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, pos.x * f, pos.y * f, img.naturalWidth * scale * f, img.naturalHeight * scale * f)
    let out = c.toDataURL('image/webp', 0.9)
    if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', 0.9)
    onDone(out)
  }

  return (
    <div className={s.overlay} onClick={onCancel}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.title}>裁切头像</div>
        {err ? <div className={s.err}>{err}</div> : (
          <>
            <div
              className={s.stage}
              style={{ width: VIEW, height: VIEW }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                drag.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y }
              }}
              onPointerMove={(e) => {
                const d = drag.current
                if (d) setPos(clamp(d.ox + e.clientX - d.px, d.oy + e.clientY - d.py))
              }}
              onPointerUp={() => { drag.current = null }}
            >
              {img && (
                <img
                  src={img.src}
                  draggable={false}
                  style={{
                    position: 'absolute', left: pos.x, top: pos.y,
                    width: img.naturalWidth * scale, height: img.naturalHeight * scale,
                    maxWidth: 'none', userSelect: 'none', pointerEvents: 'none',
                  }}
                />
              )}
              <div className={s.ring} />
            </div>
            <input
              className={s.slider} type="range" min={1} max={4} step={0.01}
              value={zoom} onChange={(e) => changeZoom(Number(e.target.value))}
            />
            <div className={s.hint}>拖动调整位置，滑块缩放</div>
          </>
        )}
        <div className={s.actions}>
          <button className={s.cancel} onClick={onCancel}>取消</button>
          <button className={s.ok} onClick={confirm} disabled={!img}>使用此头像</button>
        </div>
      </div>
    </div>
  )
}
