import type { Step } from '../types/verification-types'

export const VERIFICATION_STEPS: Step[] = [
  { id: 1, label: 'Account', status: 'complete' },
  { id: 2, label: 'Profile', status: 'complete' },
  { id: 3, label: 'Identity', status: 'current' },
  { id: 4, label: 'Review', status: 'upcoming' },
]

export const ACCEPTED_FILE_TYPES = ['.pdf', '.jpg', '.jpeg', '.png']
export const MAX_FILE_SIZE_MB = 10

export const SESSION_LABEL = 'SECURED SESSION'
export const PRODUCT_NAME = 'IntegrityOS'

export const PRIVACY_POINTS: string[] = [
  'Documents are encrypted in transit and at rest using AES-256.',
  'Biometric scans are processed locally and never stored as raw images.',
  'Data is retained only for the duration required by compliance policy.',
  'You can request deletion of your verification data at any time.',
]
