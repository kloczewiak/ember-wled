import { useEffect, useRef } from 'react'
import { onLiveFrame, send, useStore } from '../store'
import { useSelection } from '../hooks'
import { Button, cx } from './controls'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'

// Draws liveview frames: 'L', version (1 = 1D, 2 = 2D with width/height bytes), then RGB triplets.
export function LivePreview({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(
    () =>
      onLiveFrame((f) => {
        const canvas = ref.current
        if (!canvas) return
        const is2D = f[1] === 2
        const w = is2D ? f[2] : (f.length - 2) / 3
        const h = is2D ? f[3] : 1
        const off = is2D ? 4 : 2
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
        }
        canvas.style.aspectRatio = is2D ? `${w} / ${h}` : ''
        canvas.style.height = is2D ? 'auto' : ''
        // a matrix keeps its shape; a strip stretches to the full width (contain would leave empty ends)
        canvas.style.objectFit = is2D ? 'contain' : 'fill'
        const ctx = canvas.getContext('2d')!
        const img = ctx.createImageData(w, h)
        for (let i = 0; i < w * h; i++) {
          img.data.set([f[off + i * 3], f[off + i * 3 + 1], f[off + i * 3 + 2], 255], i * 4)
        }
        ctx.putImageData(img, 0, 0)
      }),
    [],
  )
  // on a strip, thin gaps mark where one segment ends and the next begins, like the segment bar
  const segs = useStore((s) => s.state?.seg)
  const total = useStore((s) => s.info?.leds.count ?? 0)
  const { isMatrix } = useSelection()
  const cuts =
    isMatrix || !segs || !total
      ? []
      : [...new Set(segs.flatMap((g) => [g.start, g.stop]))].filter((x) => x > 0 && x < total)
  return (
    <div className={cx('relative', className)}>
      <canvas
        ref={ref}
        role="img"
        aria-label="Live preview of the LEDs"
        className="block h-2 w-full rounded-sm bg-black"
        style={{ imageRendering: 'pixelated', maxHeight: 280 }}
      />
      {cuts.map((x) => (
        <span
          key={x}
          aria-hidden
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-background"
          style={{ left: `${(x / total) * 100}%` }}
        />
      ))}
    </div>
  )
}

// Shown while the device is receiving realtime data (E1.31, DDP, Hyperion, ...), which overrides the UI.
export function RealtimeBanner() {
  const info = useStore((s) => s.info)
  const lor = useStore((s) => s.state?.lor ?? 0)
  if (!info?.live) return null
  if (lor > 0) {
    return (
      <Alert className="mx-4 w-auto">
        <AlertDescription>
          Ignoring live {info.lm} data {lor === 2 ? 'until reboot' : 'once'}.
        </AlertDescription>
        <AlertAction>
          <Button size="sm" onClick={() => send({ lor: 0 })}>
            Resume live data
          </Button>
        </AlertAction>
      </Alert>
    )
  }
  if (info.liveseg >= 0) return null
  return (
    <Alert className="mx-4 w-auto">
      <AlertTitle>
        Receiving live {info.lm} data{info.lip.length > 2 ? ` from ${info.lip}` : ''}
      </AlertTitle>
      <AlertDescription>
        Your changes won't show while it lasts.
        <div className="mt-2 flex gap-2">
          <Button onClick={() => send({ lor: 1 })}>Override once</Button>
          <Button onClick={() => send({ lor: 2 })}>Override until reboot</Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
