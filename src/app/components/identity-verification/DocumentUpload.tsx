import React from 'react'
import { EnrolmentDocumentForm } from '../verification/EnrolmentDocumentForm'

/**
 * Registration step 3: proof of enrolment (college ID card or institution
 * fee receipt). Submitted documents are reviewed by an administrator; the
 * student can take exams once approved.
 */
export function DocumentUpload() {
  return <EnrolmentDocumentForm />
}
