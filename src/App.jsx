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

  const points = useMemo(() => {
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

    return raw.map(({ x, y, seed }) => {
      const dx = (x - cx) * scale
      const dy = -(y - cy) * scale
      return { left: w / 2 + dx, top: h / 2 + dy, seed }
    })
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

  // Heart particles following the cursor
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

    const mouse = { x: w / 2, y: h / 2, lastX: w / 2, lastY: h / 2, moved: false }

    const onMove = (e) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
      mouse.moved = true
    }
    const onTouch = (e) => {
      const t = e.touches && e.touches[0]
      if (!t) return
      mouse.x = t.clientX
      mouse.y = t.clientY
      mouse.moved = true
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('touchmove', onTouch, { passive: true })

    let spawnAccum = 0
    const loop = () => {
      ctx.clearRect(0, 0, w, h)

      // Spawn hearts at cursor when it moves
      if (mouse.moved) {
        const dx = mouse.x - mouse.lastX
        const dy = mouse.y - mouse.lastY
        const dist = Math.hypot(dx, dy)
        spawnAccum += dist
        const spawnInterval = 18
        while (spawnAccum >= spawnInterval) {
          spawnAccum -= spawnInterval
          const t = spawnAccum / Math.max(dist, 1)
          hearts.push({
            x: mouse.lastX + dx * t + (Math.random() - 0.5) * 6,
            y: mouse.lastY + dy * t + (Math.random() - 0.5) * 6,
            vx: (Math.random() - 0.5) * 0.6,
            vy: -0.4 - Math.random() * 1.1,
            size: 0.18 + Math.random() * 0.34,
            color: palette[Math.floor(Math.random() * palette.length)],
            life: 1,
            decay: 0.006 + Math.random() * 0.012,
            rotation: (Math.random() - 0.5) * 0.6,
            rotSpeed: (Math.random() - 0.5) * 0.04,
          })
        }
        mouse.lastX = mouse.x
        mouse.lastY = mouse.y
        mouse.moved = false
      } else {
        spawnAccum = 0
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
    <div className="relative min-h-screen bg-black overflow-hidden">
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
                          className="neon-text inline-block text-[clamp(11px,3.2vw,22px)] sm:text-[clamp(14px,2.6vw,34px)]"
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

          {/* Name Соня in the center of the heart */}
          <AnimatePresence>
            {visibleCount >= points.length && (
              <motion.div
                key="sonya-name"
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none"
                style={{ zIndex: 20 }}
                initial={{ opacity: 0, scale: 0.7, filter: 'blur(24px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.9, filter: 'blur(12px)' }}
                transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
              >
                <motion.h1
                  className="sonya-name whitespace-nowrap"
                  animate={{
                    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                    textShadow: [
                      '0 0 18px rgba(255,79,216,0.55), 0 0 40px rgba(199,125,255,0.35)',
                      '0 0 28px rgba(255,79,216,0.8), 0 0 70px rgba(199,125,255,0.55)',
                      '0 0 18px rgba(255,79,216,0.55), 0 0 40px rgba(199,125,255,0.35)',
                    ],
                  }}
                  transition={{
                    backgroundPosition: { duration: 8, repeat: Infinity, ease: 'linear' },
                    textShadow: { duration: 4, repeat: Infinity, ease: 'easeInOut' },
                  }}
                >
                  Соня
                </motion.h1>
              </motion.div>
            )}
          </AnimatePresence>
      </div>
    </div>
  )
}

export default App
