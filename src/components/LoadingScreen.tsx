import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type Phase = 'loading' | 'slogan' | 'done'

interface LoadingScreenProps {
  isLoading: boolean
  onComplete?: () => void
}

export function LoadingScreen({ isLoading, onComplete }: LoadingScreenProps) {
  const [phase, setPhase] = useState<Phase>('loading')

  useEffect(() => {
    if (!isLoading && phase === 'loading') {
      setPhase('slogan')
    }
  }, [isLoading, phase])

  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (phase === 'slogan') {
      const t = setTimeout(() => {
        setExiting(true)
      }, 2800)
      return () => clearTimeout(t)
    }
  }, [phase])

  useEffect(() => {
    if (exiting) {
      const t = setTimeout(() => {
        setPhase('done')
        onComplete?.()
      }, 500)
      return () => clearTimeout(t)
    }
  }, [exiting, onComplete])

  if (phase === 'done') return null

  return (
    <motion.div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#1a1136]"
      initial={false}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.5 }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          className="flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
        {phase === 'loading' ? (
          <motion.div
            className="flex flex-col items-center gap-8"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            <div className="relative">
              <img
                src="/logo_sinfondo.png"
                alt="Truckflow"
                className="h-24 w-auto max-w-[220px] object-contain"
              />
              <div className="absolute -bottom-8 left-1/2 flex -translate-x-1/2 gap-2">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="h-0 w-0 border-l-[7px] border-r-[7px] border-b-[12px] border-l-transparent border-r-transparent border-b-violet-400"
                    style={{ transformOrigin: 'center bottom' }}
                    animate={{
                      y: [0, -12, 0],
                      opacity: [0.5, 1, 0.5],
                      scale: [1, 1.1, 1],
                    }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      delay: i * 0.25,
                      ease: 'easeInOut',
                    }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            className="flex flex-col items-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="bg-gradient-to-r from-violet-300 via-white to-violet-300 bg-clip-text text-4xl font-black tracking-[0.35em] text-transparent drop-shadow-[0_0_24px_rgba(196,181,253,0.6)] md:text-5xl">
              TRUCKFLOW
            </span>
          </motion.div>
        )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
