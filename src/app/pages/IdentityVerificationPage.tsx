import React from 'react'
import { 
  IdentityHeader, 
  IdentityProgressBar, 
  DocumentUpload, 
  FaceVerification, 
  PrivacyCard, 
  ActionButtons, 
  IdentityFooter 
} from '../components/identity-verification'

interface IdentityVerificationPageProps {
  user?: any
  onPrevious: () => void
  onSkip: () => void
  onContinue: () => void
  onRefreshSession?: () => void
}

export default function IdentityVerificationPage({ 
  user,
  onPrevious, 
  onSkip, 
  onContinue,
  onRefreshSession
}: IdentityVerificationPageProps) {
  return (
    <div className="min-h-screen bg-page-bg flex flex-col font-sans">
      <IdentityHeader />

      <main className="flex-1 w-full">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="mb-8">
            <IdentityProgressBar />
          </div>

          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-900">
              Identity Verification
            </h1>
            <p className="text-sm text-ink-500 mt-1">
              Step 3 of 4 — Upload your ID and complete a quick face scan.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DocumentUpload />
            <FaceVerification user={user} onVerificationSuccess={onRefreshSession} />
          </div>

          <div className="mt-6">
            <PrivacyCard />
          </div>

          <ActionButtons 
            onPrevious={onPrevious} 
            onSkip={onSkip} 
            onContinue={onContinue} 
          />
        </div>
      </main>

      <IdentityFooter />
    </div>
  );
}
