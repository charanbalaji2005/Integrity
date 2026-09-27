import React, { useRef, useState } from 'react'
import { UploadCloud, FileCheck2, X } from 'lucide-react'
import { Card, IconWrap, Pill, Badge } from '../ui/custom-verification'
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE_MB } from '../../utils/verification-constants'
import type { UploadedDocument } from '../../types/verification-types'

export function DocumentUpload() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [document, setDocument] = useState<UploadedDocument | null>(null)

  function formatSize(bytes: number) {
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const file = files[0]
    
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const jpegBase64 = canvas.toDataURL('image/jpeg');
          localStorage.setItem('uploaded_id_card', jpegBase64);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);

    setDocument({
      name: file.name,
      sizeLabel: formatSize(file.size),
      status: 'ready',
    })
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <Card>
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <IconWrap tone="tan" className="h-11 w-11">
            <UploadCloud size={20} strokeWidth={2} />
          </IconWrap>
          <div>
            <h2 className="text-base font-bold text-ink-900">Government ID</h2>
            <p className="text-sm text-ink-500">Upload a clear photo or scan</p>
          </div>
        </div>

        {document && <Badge tone="green">READY</Badge>}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={[
          'relative cursor-pointer rounded-2xl border-2 border-dashed bg-upload-bg shadow-upload-box transition-premium',
          'flex flex-col items-center justify-center text-center px-6 py-10',
          isDragging ? 'border-tan-600 bg-upload-bg/70' : 'border-upload-border hover:border-tan-500',
        ].join(' ')}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES.join(',')}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {document ? (
          <div className="flex items-center gap-3 w-full max-w-xs">
            <IconWrap tone="green" className="h-10 w-10 shrink-0">
              <FileCheck2 size={18} strokeWidth={2.2} />
            </IconWrap>
            <div className="text-left flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink-900 truncate">{document.name}</p>
              <p className="text-xs text-ink-500">{document.sizeLabel}</p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setDocument(null)
                localStorage.removeItem('uploaded_id_card')
              }}
              className="shrink-0 text-ink-400 hover:text-ink-700 transition-premium"
              aria-label="Remove file"
            >
              <X size={16} strokeWidth={2.2} />
            </button>
          </div>
        ) : (
          <>
            <UploadCloud size={28} strokeWidth={1.6} className="text-tan-500 mb-3" />
            <p className="text-sm font-semibold text-ink-700">
              Drag and drop, or <span className="text-tan-600 underline">browse</span>
            </p>
            <p className="text-xs text-ink-400 mt-1">
              {ACCEPTED_FILE_TYPES.join(', ').toUpperCase()} up to {MAX_FILE_SIZE_MB}MB
            </p>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-5">
        <Pill label="Passport" active />
        <Pill label="Driver's License" />
        <Pill label="National ID" />
      </div>
    </Card>
  )
}
