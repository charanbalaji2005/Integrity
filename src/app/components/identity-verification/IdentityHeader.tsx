import React from 'react'
import { ShieldCheck, Lock } from 'lucide-react'
import { Badge, IconWrap } from '../ui/custom-verification'
import { PRODUCT_NAME, SESSION_LABEL } from '../../utils/verification-constants'

export function IdentityHeader() {
  return (
    <header className="w-full bg-card-bg border-b border-card-border">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <IconWrap tone="ink" className="h-9 w-9">
            <ShieldCheck size={20} strokeWidth={2.2} />
          </IconWrap>
          <span className="text-lg font-extrabold tracking-tight text-ink-900">
            {PRODUCT_NAME}
          </span>
        </div>

        <Badge tone="dark">
          <Lock size={12} strokeWidth={2.4} />
          {SESSION_LABEL}
        </Badge>
      </div>
    </header>
  )
}
