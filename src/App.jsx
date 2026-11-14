import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import initFluid from './lib/fluidSim.js'

function App() {
  const [started, setStarted] = useState(false)
  const [visibleCount, setVisibleCount] = useState(0)
  const canvasRef = useRef(null)
  const heartsCanvasRef = useRef(null)
  const [viewport, setViewport] = useState(() => ({
    w: window.visualViewport?.width ? Math.round(window.visualViewport.width) : window.innerWidth,
    h: window.visualViewport?.height ? Math.round(window.visualViewport.height) : window.innerHeight,
  }))

  const { points, namePos, nameWidth } = useMemo(() => {
    const count = 48
    const raw = Array.from({ length: count }, (_, i) => {
      const t = (Math.PI * 2 * i) / count
      const x = 16 * Math.pow(Math.sin(t), 3)
      const y =
        13 * Math.cos(t) -
        5 * Math.cos(2 * t) -
        2 * Math.cos(3 * t) -
        Math.cos(4 * t)
      const seed = (Math.sin((i + 1) * 999.123) + 1) / 2
      return { x, y, seed }
    })

    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    for (const p of raw) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }

    const w = Math.max(1, viewport.w)
    const h = Math.max(1, viewport.h)

    const heartW = maxX - minX || 1
    const heartH = maxY - minY || 1
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2

    const isPortrait = h > w
    const marginX = w * (isPortrait ? 0.1 : 0.08)
    const marginY = h * (isPortrait ? 0.18 : 0.1)
    const availW = Math.max(1, w - marginX * 2)
    const availH = Math.max(1, h - marginY * 2)
    const sizeBoost = isPortrait ? 0.82 : 0.98
    const zoomLike = isPortrait ? 1.03 : 0.91

    const scale = Math.min(availW / heartW, availH / heartH) * sizeBoost * zoomLike

    const mapped = raw.map(({ x, y, seed }) => {
      const dx = (x - cx) * scale
      const dy = -(y - cy) * scale
      return { left: w / 2 + dx, top: h / 2 + dy, seed }
    })

    // Area centroid of the heart polygon — the true "inside" center for the name
    let crossSum = 0
    let cxAcc = 0
    let cyAcc = 0
    for (let i = 0; i < mapped.length; i++) {
      const a = mapped[i]
      const b = mapped[(i + 1) % mapped.length]
      const cr = a.left * b.top - b.left * a.top
      crossSum += cr
      cxAcc += (a.left + b.left) * cr
      cyAcc += (a.top + b.top) * cr
    }
    const centroid =
      crossSum !== 0
        ? { left: cxAcc / (3 * crossSum), top: cyAcc / (3 * crossSum) }
        : { left: w / 2, top: h / 2 }

    return {
      points: mapped,
      namePos: centroid,
      nameWidth: (maxX - minX) * scale * 0.72,
    }
  }, [viewport.h, viewport.w])

  useEffect(() => {
    let rafId = 0
    const getSize = () => {
      const vv = window.visualViewport
      const w = vv?.width ? Math.round(vv.width) : window.innerWidth
      const h = vv?.height ? Math.round(vv.height) : window.innerHeight
      return { w, h }
    }
    const onResize = () => {
      if (rafId) return
      rafId = window.requestAnimationFrame(() => {
        rafId = 0
        setViewport(getSize())
      })
    }
    window.addEventListener('resize', onResize, { passive: true })
    window.visualViewport?.addEventListener('resize', onResize, { passive: true })
    return () => {
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
      if (rafId) window.cancelAnimationFrame(rafId)
    }
  }, [])

  useEffect(() => {
    const startDelayMs = 900
    const stepDelayMs = 120

    const startTimerId = window.setTimeout(() => {
      setStarted(true)
      setVisibleCount(1)
    }, startDelayMs)

    let intervalId = null
    const intervalStartId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        setVisibleCount((c) => {
          const next = Math.min(c + 1, points.length)
          if (next >= points.length && intervalId) {
            window.clearInterval(intervalId)
            intervalId = null
          }
          return next
        })
      }, stepDelayMs)
    }, startDelayMs)

    return () => {
      window.clearTimeout(startTimerId)
      window.clearTimeout(intervalStartId)
      if (intervalId) window.clearInterval(intervalId)
    }
  }, [points.length])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let api = null
    let rafId = 0

    const canStart = () => {
      const rect = canvas.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && document.visibilityState === 'visible'
    }

    const start = () => {
      if (!canStart()) {
        rafId = window.requestAnimationFrame(start)
        return
      }

      try {
        api?.dispose?.()
        api = initFluid(canvas, {
          TRANSPARENT: false,
          BACK_COLOR: { r: 0, g: 0, b: 0 },
          BLOOM: true,
          BLOOM_INTENSITY: 0.28,
          BLOOM_THRESHOLD: 0.72,
          BLOOM_SOFT_KNEE: 0.55,
          BLOOM_RESOLUTION: 128,
          SUNRAYS: false,
          SPLAT_FORCE: 2600,
          SPLAT_RADIUS: 0.28,
          DENSITY_DISSIPATION: 0.997,
          VELOCITY_DISSIPATION: 0.28,
          PRESSURE: 0.35,
          PRESSURE_ITERATIONS: 10,
          CURL: 4,
          COLORFUL: false,
        })
      } catch {
        api = null
      }
    }

    rafId = window.requestAnimationFrame(start)

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId)
      api?.dispose?.()
    }
  }, [])

  // Heart particles following the cursor + autonomous idle pattern
  useEffect(() => {
    const canvas = heartsCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let rafId = 0
    let w = 0
    let h = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize, { passive: true })

    const hearts = []
    const palette = [
      '#ff4fd8', '#ff8ff1', '#c77dff', '#ff6ec7', '#e056fd',
    ]

    const drawHeart = (x, y, size, color, alpha, rotation) => {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rotation)
      ctx.scale(size, size)
      ctx.globalAlpha = alpha
      ctx.fillStyle = color
      ctx.shadowColor = color
      ctx.shadowBlur = 18
      ctx.beginPath()
      // Heart path (centered at 0,0)
      ctx.moveTo(0, 0.3)
      ctx.bezierCurveTo(-0.5, -0.3, -1, 0.1, 0, 0.85)
      ctx.bezierCurveTo(1, 0.1, 0.5, -0.3, 0, 0.3)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }

    const spawnHeart = (x, y, speedScale = 1, color = null, sizeScale = 1) => {
      hearts.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: (Math.random() - 0.5) * 0.6 * speedScale,
        vy: (-0.4 - Math.random() * 1.1) * speedScale,
        size: (0.18 + Math.random() * 0.34) * sizeScale,
        color: color || palette[Math.floor(Math.random() * palette.length)],
        life: 1,
        decay: 0.006 + Math.random() * 0.012,
        rotation: (Math.random() - 0.5) * 0.6,
        rotSpeed: (Math.random() - 0.5) * 0.04,
      })
    }

    const mouse = {
      x: w / 2,
      y: h / 2,
      lastX: w / 2,
      lastY: h / 2,
      moved: false,
      lastMoveTime: performance.now(),
    }

    const onMove = (e) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
      mouse.moved = true
      mouse.lastMoveTime = performance.now()
    }
    const onTouch = (e) => {
      const t = e.touches && e.touches[0]
      if (!t) return
      mouse.x = t.clientX
      mouse.y = t.clientY
      mouse.moved = true
      mouse.lastMoveTime = performance.now()
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('touchmove', onTouch, { passive: true })

    let spawnAccum = 0
    const IDLE_THRESHOLD = 2200 // ms before auto mode kicks in

    // Multiple wandering emitters — each drifts along its own Lissajous path,
    // anchored to a different spot (center, edges, corners) so hearts roam everywhere.
    const wanderers = [
      // center
      { ox: 0.0, oy: 0.0, speed: 0.012, ax: 0.14, ay: 0.10, fx: 1.0, fy: 1.5, every: 3, size: 0.95, color: '#ff4fd8' },
      { ox: 0.0, oy: 0.0, speed: 0.009, ax: 0.12, ay: 0.14, fx: 1.0, fy: 2.0, every: 3, size: 0.85, color: '#c77dff' },
      // corners
      { ox: -0.34, oy: -0.30, speed: 0.013, ax: 0.10, ay: 0.08, fx: 1.0, fy: 1.0, every: 3, size: 0.9, color: '#ff8ff1' },
      { ox: 0.34, oy: -0.30, speed: 0.011, ax: 0.10, ay: 0.08, fx: 1.0, fy: 2.0, every: 3, size: 0.85, color: '#e056fd' },
      { ox: -0.34, oy: 0.30, speed: 0.014, ax: 0.10, ay: 0.08, fx: 2.0, fy: 1.0, every: 3, size: 0.8, color: '#ff6ec7' },
      { ox: 0.34, oy: 0.30, speed: 0.010, ax: 0.10, ay: 0.08, fx: 3.0, fy: 2.0, every: 3, size: 0.95, color: '#ffb3ec' },
      // left / right edges
      { ox: -0.42, oy: 0.0, speed: 0.012, ax: 0.06, ay: 0.16, fx: 1.0, fy: 2.0, every: 3, size: 0.85, color: '#ff4fd8' },
      { ox: 0.42, oy: 0.0, speed: 0.015, ax: 0.06, ay: 0.16, fx: 2.0, fy: 1.0, every: 3, size: 0.8, color: '#c77dff' },
      // top / bottom edges
      { ox: 0.0, oy: -0.40, speed: 0.013, ax: 0.18, ay: 0.06, fx: 1.5, fy: 1.0, every: 3, size: 0.9, color: '#ff8ff1' },
      { ox: 0.0, oy: 0.40, speed: 0.011, ax: 0.18, ay: 0.06, fx: 1.0, fy: 1.5, every: 3, size: 0.75, color: '#e056fd' },
      // extra diagonal drifters
      { ox: -0.24, oy: -0.10, speed: 0.016, ax: 0.12, ay: 0.10, fx: 2.0, fy: 3.0, every: 4, size: 0.85, color: '#ffd6f5' },
      { ox: 0.24, oy: 0.10, speed: 0.014, ax: 0.12, ay: 0.10, fx: 3.0, fy: 2.0, every: 4, size: 0.8, color: '#ff6ec7' },
    ].map((wr, i) => ({ ...wr, phase: (i * Math.PI) / 3, acc: 0 }))

    const loop = () => {
      ctx.clearRect(0, 0, w, h)
      const now = performance.now()
      const idle = now - mouse.lastMoveTime > IDLE_THRESHOLD

      if (mouse.moved && !idle) {
        const dx = mouse.x - mouse.lastX
        const dy = mouse.y - mouse.lastY
        const dist = Math.hypot(dx, dy)
        spawnAccum += dist
        const spawnInterval = 18
        while (spawnAccum >= spawnInterval) {
          spawnAccum -= spawnInterval
          const t = spawnAccum / Math.max(dist, 1)
          spawnHeart(mouse.lastX + dx * t, mouse.lastY + dy * t)
        }
        mouse.lastX = mouse.x
        mouse.lastY = mouse.y
        mouse.moved = false
      } else {
        spawnAccum = 0
      }

      // Autonomous mode: several hearts drifting along flowing Lissajous curves
      if (idle) {
        const cx = w / 2
        const cy = h / 2
        const base = Math.min(w, h)
        for (const wr of wanderers) {
          wr.phase += wr.speed
          wr.acc += 1
          if (wr.acc < wr.every) continue
          wr.acc = 0
          const nx = cx + wr.ox * w + Math.sin(wr.phase * wr.fx) * base * wr.ax
          const ny = cy + wr.oy * h + Math.sin(wr.phase * wr.fy) * base * wr.ay
          spawnHeart(nx, ny, 0.85, wr.color, wr.size * 0.7)
        }
      }

      for (let i = hearts.length - 1; i >= 0; i--) {
        const hrt = hearts[i]
        hrt.x += hrt.vx
        hrt.y += hrt.vy
        hrt.vy -= 0.008 // gentle float up
        hrt.rotation += hrt.rotSpeed
        hrt.life -= hrt.decay
        if (hrt.life <= 0) {
          hearts.splice(i, 1)
          continue
        }
        drawHeart(hrt.x, hrt.y, hrt.size * 22, hrt.color, hrt.life, hrt.rotation)
      }

      rafId = window.requestAnimationFrame(loop)
    }
    rafId = window.requestAnimationFrame(loop)

    return () => {
      window.cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onTouch)
    }
  }, [])

  return (
    <div className="relative h-[100svh] w-[100svw] overflow-hidden bg-black">
      <canvas
        ref={canvasRef}
        aria-hidden
        className="fixed inset-0 h-[100svh] w-[100svw]"
        style={{ pointerEvents: 'none', opacity: 1, zIndex: 0, display: 'block' }}
      />
      <canvas
        ref={heartsCanvasRef}
        aria-hidden
        className="fixed inset-0 h-[100svh] w-[100svw]"
        style={{ pointerEvents: 'none', opacity: 1, zIndex: 1, display: 'block' }}
      />

      <div className="relative z-10 h-[100svh] w-[100svw]">
          <AnimatePresence>
            {started
              ? points.slice(0, visibleCount).map((p, i) => {
                  const floatDelay = 0.55 + p.seed * 0.35
                  const floatDuration = 3.9 + p.seed * 2.3
                  const shimmerDuration = 1.9 + p.seed * 1.5
                  const yAmp = 9 + p.seed * 11
                  const rotAmp = 0.35 + p.seed * 0.85
                  const xAmp = (p.seed - 0.5) * 10
                  const rebirthEnabled = visibleCount >= points.length
                  const rebirthDuration = (6.8 + p.seed * 2.8) * 0.8
                  const rebirthDelay = (i / points.length) * rebirthDuration

                  return (
                    <span
                      key={i}
                      className="absolute select-none whitespace-nowrap"
                      style={{
                        left: `${p.left}px`,
                        top: `${p.top}px`,
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <motion.span
                        className="inline-block"
                        initial={{
                          opacity: 0,
                          scale: 0.98,
                          y: 12,
                          filter: 'blur(18px) saturate(0.65)',
                        }}
                        animate={{
                          opacity: 1,
                          scale: 1,
                          y: 0,
                          filter: 'blur(0px) saturate(1)',
                        }}
                        exit={{ opacity: 0 }}
                        transition={{
                          opacity: { duration: 1.35, ease: [0.16, 1, 0.3, 1] },
                          scale: { duration: 1.35, ease: [0.16, 1, 0.3, 1] },
                          y: { duration: 1.35, ease: [0.16, 1, 0.3, 1] },
                          filter: { duration: 1.35, ease: [0.16, 1, 0.3, 1] },
                        }}
                      >
                        <motion.span
                          className="neon-text inline-block text-[clamp(9.4px,2.72vw,18.7px)] sm:text-[clamp(11.9px,2.21vw,28.9px)]"
                          initial={{ backgroundPosition: '0% 50%' }}
                          animate={{
                            opacity: rebirthEnabled
                              ? [1, 1, 0.5, 1, 1]
                              : [0.92, 1, 0.92],
                            filter: rebirthEnabled
                              ? [
                                  'blur(0px)',
                                  'blur(0px)',
                                  'blur(9px)',
                                  'blur(0px)',
                                  'blur(0px)',
                                ]
                              : 'blur(0px)',
                            y: [0, -yAmp, 0],
                            x: [0, xAmp, 0],
                            rotate: [-rotAmp, rotAmp, -rotAmp],
                            scale: rebirthEnabled
                              ? [1, 1, 0.997, 1, 1]
                              : [1, 1.02, 1],
                            backgroundPosition: ['0% 50%', '100% 50%'],
                          }}
                          transition={{
                            opacity: rebirthEnabled
                              ? {
                                  duration: rebirthDuration,
                                  times: [0, 0.36, 0.5, 0.64, 1],
                                  ease: 'easeInOut',
                                  repeat: Infinity,
                                  delay: rebirthDelay,
                                }
                              : {
                                  duration: 3.8,
                                  ease: 'easeInOut',
                                  repeat: Infinity,
                                },
                            filter: rebirthEnabled
                              ? {
                                  duration: rebirthDuration,
                                  times: [0, 0.36, 0.5, 0.64, 1],
                                  ease: 'easeInOut',
                                  repeat: Infinity,
                                  delay: rebirthDelay,
                                }
                              : undefined,
                            y: {
                              delay: floatDelay,
                              duration: floatDuration,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            },
                            x: {
                              delay: floatDelay,
                              duration: floatDuration,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            },
                            rotate: {
                              delay: floatDelay,
                              duration: floatDuration,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            },
                            scale: {
                              delay: floatDelay,
                              duration: floatDuration,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            },
                            backgroundPosition: {
                              delay: floatDelay,
                              duration: shimmerDuration,
                              repeat: Infinity,
                              ease: 'linear',
                            },
                          }}
                        >
                          С днём рождения)
                        </motion.span>
                      </motion.span>
                    </span>
                  )
                })
              : null}
          </AnimatePresence>

          {/* Name Соня in the center of the heart — hand-drawn SVG */}
          <AnimatePresence>
            {visibleCount >= points.length && (
              <motion.div
                key="sonya-name"
                className="absolute pointer-events-none select-none"
                style={{ zIndex: 20, left: `${namePos.left}px`, top: `${namePos.top}px` }}
                initial={{ opacity: 0, scale: 0.85, x: '-50%', y: '-45%', filter: 'blur(20px)' }}
                animate={{ opacity: 1, scale: 1, x: '-50%', y: '-45%', filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-45%', filter: 'blur(12px)' }}
                transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
              >
                <svg
                  className="sonya-svg"
                  viewBox="0 0 640 300"
                  width={Math.round(nameWidth)}
                  height="auto"
                  style={{ overflow: 'visible' }}
                >
                  <defs>
                    <linearGradient id="sonyaGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#ff4fd8" />
                      <stop offset="35%" stopColor="#ff8ff1" />
                      <stop offset="65%" stopColor="#c77dff" />
                      <stop offset="100%" stopColor="#ff4fd8" />
                    </linearGradient>
                    <filter id="sonyaGlow" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="6" result="blur1" />
                      <feGaussianBlur stdDeviation="14" result="blur2" />
                      <feMerge>
                        <feMergeNode in="blur2" />
                        <feMergeNode in="blur1" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <motion.text
                    x="50%"
                    y="50%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontFamily="'Marck Script', 'Caveat', cursive"
                    fontSize="210"
                    fill="url(#sonyaGrad)"
                    stroke="url(#sonyaGrad)"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#sonyaGlow)"
                    style={{ paintOrder: 'stroke fill' }}
                    initial={{ strokeDasharray: 2400, strokeDashoffset: 2400, fillOpacity: 0 }}
                    animate={{
                      strokeDashoffset: 0,
                      fillOpacity: [0, 0, 1],
                      strokeOpacity: [1, 1, 0.85],
                    }}
                    transition={{
                      strokeDashoffset: { duration: 2.6, ease: [0.65, 0, 0.35, 1], delay: 0.6 },
                      fillOpacity: {
                        duration: 1.2,
                        times: [0, 0.85, 1],
                        delay: 0.6,
                      },
                      strokeOpacity: { duration: 1.2, times: [0, 0.85, 1], delay: 0.6 },
                    }}
                  >
                    Соня
                  </motion.text>
                </svg>
              </motion.div>
            )}
          </AnimatePresence>
      </div>
    </div>
  )
}

export default App
