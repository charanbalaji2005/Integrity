import React from 'react'
import { PRODUCT_NAME } from '../../utils/verification-constants'

export function IdentityFooter() {
  return (
    <footer className="w-full py-8">
      <p className="text-center text-xs text-ink-400">
        {PRODUCT_NAME} encrypts every submission end-to-end. Need help?{' '}
        <a href="#" className="text-ink-700 underline hover:text-ink-900 transition-premium">
          Contact support
        </a>
        .
      </p>
    </footer>
  )
}
