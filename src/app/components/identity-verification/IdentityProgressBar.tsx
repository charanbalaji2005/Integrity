import React from 'react'
import { Check } from 'lucide-react'
import { VERIFICATION_STEPS } from '../../utils/verification-constants'
import type { Step } from '../../types/verification-types'

function StepDot({ step }: { step: Step }) {
  if (step.status === 'complete') {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-900 text-card-bg shadow-pill transition-premium">
        <Check size={14} strokeWidth={2.6} />
      </div>
    )
  }

  if (step.status === 'current') {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-card-bg border-2 border-ink-900 text-ink-900 text-xs font-bold shadow-card transition-premium">
        {step.id}
      </div>
    )
  }

  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-upload-bg border border-upload-border text-ink-400 text-xs font-semibold transition-premium">
      {step.id}
    </div>
  )
}

export function IdentityProgressBar() {
  return (
    <div className="w-full">
      <div className="flex items-center">
        {VERIFICATION_STEPS.map((step, idx) => (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <StepDot step={step} />
              <span
                className={[
                  'text-xs font-medium whitespace-nowrap',
                  step.status === 'upcoming' ? 'text-ink-400' : 'text-ink-700',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>

            {idx < VERIFICATION_STEPS.length - 1 && (
              <div
                className={[
                  'h-[2px] flex-1 mx-2 rounded-full transition-premium',
                  step.status === 'complete' ? 'bg-ink-900' : 'bg-upload-border',
                ].join(' ')}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
