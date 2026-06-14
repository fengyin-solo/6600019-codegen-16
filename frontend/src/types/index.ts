export interface WaveformData {
  time: number[]
  bhz: number[]  // vertical component
  bhn: number[]  // north component
  bhe: number[]  // east component
  samplingRate: number
}

export interface PhasePick {
  id: string
  type: 'P' | 'S'
  time: number
  confidence: number
  method: string
}

export interface Station {
  id: string
  name: string
  latitude: number
  longitude: number
  elevation: number
}

export interface SeismicEvent {
  id: string
  magnitude: number
  depth: number
  originTime: string
  location: string
}

export type TaskStatus = 'pending' | 'uploading' | 'parsing' | 'analyzing' | 'completed' | 'failed'

export interface ProcessingTask {
  id: string
  filename: string
  file_size: number
  status: TaskStatus
  stage: string
  progress: number
  message: string
  created_at: number
  updated_at: number
  result?: {
    waveform: WaveformData
    picks: PhasePick[]
  }
}

export interface UploadResponse {
  task_id: string
  filename: string
  file_size: number
  message: string
}
