export type StepStatus = 'complete' | 'current' | 'upcoming'

export interface Step {
  id: number
  label: string
  status: StepStatus
}

export type DocumentStatus = 'idle' | 'uploading' | 'ready' | 'error'

export interface UploadedDocument {
  name: string
  sizeLabel: string
  status: DocumentStatus
}

export type ScanStatus = 'idle' | 'scanning' | 'verified'

export interface FaceScanState {
  status: ScanStatus
  progress: number
}
