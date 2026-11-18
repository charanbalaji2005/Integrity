import React from 'react'
import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`card hover:shadow-card-hover transition-premium p-6 sm:p-7 ${className}`}
    >
      {children}
    </div>
  )
}
