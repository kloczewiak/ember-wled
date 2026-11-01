import { useEffect, useRef } from 'react'
import { onLiveFrame, send, useStore } from '../store'
import { Button, cx } from './ui'

// Draws liveview frames: 'L', version (1 = 1D, 2 = 2D with width/height bytes), then RGB triplets.
export function LivePreview({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => onLiveFrame((f) => {
    const canvas = ref.current
    if (!canvas) return
    const is2D = f[1] === 2
    const w = is2D ? f[2] : (f.length - 2) / 3
    const h = is2D ? f[3] : 1
    const off = is2D ? 4 : 2
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    canvas.style.aspectRatio = is2D ? `${w} / ${h}` : ''
    canvas.style.height = is2D ? 'auto' : ''
    const ctx = canvas.getContext('2d')!
    const img = ctx.createImageData(w, h)
    for (let i = 0; i < w * h; i++) {
      img.data.set([f[off + i * 3], f[off + i * 3 + 1], f[off + i * 3 + 2], 255], i * 4)
    }
    ctx.putImageData(img, 0, 0)
  }), [])
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="Live preview of the LEDs"
      className={cx('block h-2 w-full rounded-sm bg-black', className)}
      style={{ imageRendering: 'pixelated', maxHeight: 280, objectFit: 'contain' }}
    />
  )
}

// Shown while the device is receiving realtime data (E1.31, DDP, Hyperion, ...), which overrides the UI.
export function RealtimeBanner() {
  const info = useStore((s) => s.info)
  const lor = useStore((s) => s.state?.lor ?? 0)
  if (!info?.live) return null
  if (lor > 0) {
    return (
      <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] text-soft">
        Ignoring live {info.lm} data {lor === 2 ? 'until reboot' : 'once'}.
        <Button size="sm" onClick={() => send({ lor: 0 })}>Resume live data</Button>
      </div>
    )
  }
  if (info.liveseg >= 0) return null
  return (
    <div className="mx-4 mt-3 flex flex-col gap-2 rounded-xl border border-warn-line bg-warn-bg px-3 py-2.5 text-[13px] text-warn-fg">
      <div>WLED is receiving live {info.lm} data{info.lip.length > 2 ? ` from ${info.lip}` : ''}. Your changes won't show.</div>
      <div className="flex gap-2">
        <button className="h-9 flex-1 rounded-lg border border-warn-line hover:bg-warn-line/40" onClick={() => send({ lor: 1 })}>Override once</button>
        <button className="h-9 flex-1 rounded-lg border border-warn-line hover:bg-warn-line/40" onClick={() => send({ lor: 2 })}>Override until reboot</button>
      </div>
    </div>
  )
}
