import React from 'react'
import type { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  tone?: 'neutral' | 'green' | 'dark'
  className?: string
}

const toneStyles: Record<NonNullable<BadgeProps['tone']>, string> = {
  neutral: 'bg-upload-bg text-ink-500 border border-upload-border',
  green: 'bg-ready-green/10 text-ready-green border border-ready-green/20',
  dark: 'bg-ink-900 text-card-bg shadow-pill',
}

export function Badge({ children, tone = 'neutral', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-wide transition-premium ${toneStyles[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
