import React from 'react'
import type { ReactNode } from 'react'

interface IconWrapProps {
  children: ReactNode
  className?: string
  tone?: 'tan' | 'ink' | 'green'
}

const toneStyles: Record<NonNullable<IconWrapProps['tone']>, string> = {
  tan: 'bg-upload-bg text-tan-600',
  ink: 'bg-card-bg text-ink-700',
  green: 'bg-ready-green/10 text-ready-green',
}

export function IconWrap({ children, className = '', tone = 'tan' }: IconWrapProps) {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-2xl shadow-icon-wrap transition-premium ${toneStyles[tone]} ${className}`}
    >
      {children}
    </div>
  )
}
