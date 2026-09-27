import React, { useState, useRef, useEffect } from 'react'
import { ScanFace, CheckCircle2 } from 'lucide-react'
import { Card, IconWrap, Badge } from '../ui/custom-verification'
import type { ScanStatus } from '../../types/verification-types'
import { toast } from 'sonner'

interface FaceVerificationProps {
  user?: any
  onVerificationSuccess?: () => void
}

export function FaceVerification({ user, onVerificationSuccess }: FaceVerificationProps) {
  const [status, setStatus] = useState<ScanStatus>('idle')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [stream])

  async function handleBegin() {
    setStatus('scanning')
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      })
      setStream(mediaStream)
      
      // Allow DOM to render video element before setting srcObject
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
        }
      }, 50)

      setTimeout(async () => {
        if (!videoRef.current) {
          mediaStream.getTracks().forEach(track => track.stop())
          setStream(null)
          setStatus('idle')
          return
        }

        const canvas = document.createElement('canvas')
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          mediaStream.getTracks().forEach(track => track.stop())
          setStream(null)
          setStatus('idle')
          return
        }

        ctx.drawImage(videoRef.current, 0, 0, 640, 480)
        const selfieBase64 = canvas.toDataURL('image/jpeg')
        const idPhotoBase64 = localStorage.getItem('uploaded_id_card') || undefined

        try {
          const res = await fetch('/api/proctoring/face-check', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              ...(user ? { 'x-user-id': user.id, 'x-user-role': user.role } : {})
            },
            body: JSON.stringify({ selfie: selfieBase64, idPhoto: idPhotoBase64 })
          })
          const data = await res.json()
          
          if (res.ok && data.success && data.data.faceDetected) {
            let isVerified = false
            if (idPhotoBase64) {
              if (data.data.match) {
                isVerified = true
                setStatus('verified')
                toast.success('Face matched to ID successfully!')
              } else {
                setStatus('idle')
                toast.error(data.data.message || 'Face verification failed: Face does not match the uploaded ID.')
              }
            } else {
              isVerified = true
              setStatus('verified')
              toast.success('Face detected and verified!')
            }

            if (isVerified && user) {
              try {
                const profileRes = await fetch('/api/profile', {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                    'x-user-role': user.role
                  },
                  body: JSON.stringify({ 
                    image: selfieBase64,
                    bypassFaceVerification: true
                  })
                })
                const profileData = await profileRes.json()
                if (profileRes.ok && profileData.success) {
                  toast.success('Identity photo registered permanently!')
                  if (onVerificationSuccess) {
                    onVerificationSuccess()
                  }
                } else {
                  console.error('Failed to store profile image:', profileData.message)
                }
              } catch (profileErr) {
                console.error('Network error storing profile image:', profileErr)
              }
            }
          } else {
            setStatus('idle')
            toast.error(data.message || 'Face detection failed. Position your face in front of the camera.')
          }
        } catch (err) {
          setStatus('idle')
          toast.error('Error contacting face check service.')
        } finally {
          mediaStream.getTracks().forEach(track => track.stop())
          setStream(null)
        }
      }, 2500)

    } catch (err) {
      setStatus('idle')
      toast.error('Could not access webcam. Please verify permissions.')
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <IconWrap tone="tan" className="h-11 w-11">
            <ScanFace size={20} strokeWidth={2} />
          </IconWrap>
          <div>
            <h2 className="text-base font-bold text-ink-900">Face Verification</h2>
            <p className="text-sm text-ink-500">Match your face to your ID</p>
          </div>
        </div>

        {status === 'verified' && <Badge tone="green">READY</Badge>}
      </div>

      <div className="relative rounded-2xl bg-ink-900 overflow-hidden h-64 flex items-center justify-center">
        {status === 'scanning' && stream && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
          />
        )}
        {status === 'scanning' && (
          <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-tan-400/40 via-tan-400/10 to-transparent animate-scan-sweep pointer-events-none" />
        )}

        {status !== 'idle' && (
          <div className="absolute h-32 w-32 rounded-full border border-tan-400/60 animate-ring-pulse pointer-events-none" />
        )}

        <svg viewBox="0 0 200 200" className="h-40 w-40 relative z-10">
          <ellipse
            cx="100"
            cy="100"
            rx="55"
            ry="70"
            fill="none"
            stroke={status === 'verified' ? '#22c55e' : '#b8a48c'}
            strokeWidth="2"
            className={status === 'scanning' ? 'animate-oval-trace' : ''}
            opacity={status === 'idle' ? 0.35 : 0.9}
          />
        </svg>

        {status === 'verified' && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink-900/40">
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 size={36} strokeWidth={2} className="text-ready-green" />
              <span className="text-sm font-semibold text-card-bg">Face matched</span>
            </div>
          </div>
        )}

        {status === 'idle' && (
          <p className="absolute bottom-4 text-xs text-card-bg/60 font-medium">
            Position your face in the frame
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={handleBegin}
        disabled={status !== 'idle'}
        className={[
          'w-full mt-5 rounded-2xl py-3 text-sm font-semibold transition-premium cursor-pointer',
          'bg-ink-900 text-card-bg shadow-btn-dark hover:shadow-btn-dark-hover hover:-translate-y-0.5 active:translate-y-0',
          'disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0',
        ].join(' ')}
      >
        {status === 'idle' && 'Begin Face Scan'}
        {status === 'scanning' && 'Scanning…'}
        {status === 'verified' && 'Verified'}
      </button>
    </Card>
  )
}
