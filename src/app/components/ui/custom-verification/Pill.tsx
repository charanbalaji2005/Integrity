import React from 'react'

interface PillProps {
  label: string
  active?: boolean
}

export function Pill({ label, active = false }: PillProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium transition-premium cursor-default',
        active
          ? 'bg-ink-900 text-card-bg shadow-pill hover:shadow-pill-hover hover:-translate-y-0.5'
          : 'bg-card-bg text-ink-500 border border-card-border hover:-translate-y-0.5 hover:shadow-card',
      ].join(' ')}
    >
      {label}
    </span>
  )
}
