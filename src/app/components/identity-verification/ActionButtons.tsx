import React from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'

interface ActionButtonsProps {
  onPrevious?: () => void
  onSkip?: () => void
  onContinue?: () => void
}

export function ActionButtons({ onPrevious, onSkip, onContinue }: ActionButtonsProps) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8">
      <button
        type="button"
        onClick={onPrevious}
        className="inline-flex items-center gap-2 text-sm font-semibold text-ink-500 hover:text-ink-900 transition-premium cursor-pointer"
      >
        <ArrowLeft size={16} strokeWidth={2.2} />
        Previous Step
      </button>

      <div className="flex items-center gap-3 w-full sm:w-auto">
        <button
          type="button"
          onClick={onSkip}
          className="flex-1 sm:flex-none rounded-2xl border border-card-border bg-card-bg px-5 py-3 text-sm font-semibold text-ink-700 shadow-card hover:shadow-card-hover hover:-translate-y-0.5 active:translate-y-0 transition-premium cursor-pointer"
        >
          Skip for now
        </button>

        <button
          type="button"
          onClick={onContinue}
          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-2xl bg-ink-900 px-5 py-3 text-sm font-semibold text-card-bg shadow-btn-dark hover:shadow-btn-dark-hover hover:-translate-y-0.5 active:translate-y-0 transition-premium cursor-pointer"
        >
          Verify &amp; Continue
          <ArrowRight size={16} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  )
}
