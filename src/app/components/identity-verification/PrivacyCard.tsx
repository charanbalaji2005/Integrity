import React from 'react'
import { ShieldCheck } from 'lucide-react'
import { Card, IconWrap } from '../ui/custom-verification'
import { PRIVACY_POINTS } from '../../utils/verification-constants'

export function PrivacyCard() {
  return (
    <Card className="bg-upload-bg/40">
      <div className="flex items-center gap-3 mb-4">
        <IconWrap tone="tan" className="h-10 w-10">
          <ShieldCheck size={18} strokeWidth={2} />
        </IconWrap>
        <h2 className="text-base font-bold text-ink-900">Privacy &amp; Data Governance</h2>
      </div>

      <ul className="space-y-2.5">
        {PRIVACY_POINTS.map((point) => (
          <li key={point} className="flex items-start gap-2.5 text-sm text-ink-700">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-tan-500 shrink-0" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
