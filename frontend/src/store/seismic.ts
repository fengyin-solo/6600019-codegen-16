import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { WaveformData, PhasePick, Station, SeismicEvent, ProcessingTask, UploadResponse } from '../types'

export const useSeismicStore = defineStore('seismic', () => {
  const waveform = ref<WaveformData | null>(null)
  const picks = ref<PhasePick[]>([])
  const selectedStation = ref<Station | null>(null)
  const staWindow = ref(1.0)
  const ltaWindow = ref(10.0)
  const threshold = ref(3.5)
  const isLoading = ref(false)
  const currentTask = ref<ProcessingTask | null>(null)
  const taskHistory = ref<ProcessingTask[]>([])
  let pollInterval: number | null = null

  const events = ref<SeismicEvent[]>([
    { id: '1', magnitude: 4.2, depth: 12.5, originTime: '2025-01-15T08:23:41Z', location: '四川雅安' },
    { id: '2', magnitude: 3.8, depth: 8.3, originTime: '2025-01-14T14:12:05Z', location: '云南大理' },
    { id: '3', magnitude: 5.1, depth: 25.0, originTime: '2025-01-13T02:45:33Z', location: '台湾花莲' },
  ])

  const stations = ref<Station[]>([
    { id: 'STA01', name: 'BJI', latitude: 39.9, longitude: 116.4, elevation: 45 },
    { id: 'STA02', name: 'SSE', latitude: 31.2, longitude: 121.5, elevation: 10 },
    { id: 'STA03', name: 'KMI', latitude: 25.0, longitude: 102.7, elevation: 1890 },
    { id: 'STA04', name: 'HIA', latitude: 49.3, longitude: 119.7, elevation: 610 },
  ])

  const isProcessing = computed(() => {
    return currentTask.value !== null && 
           ['pending', 'uploading', 'parsing', 'analyzing'].includes(currentTask.value.status)
  })

  function generateMockWaveform(): WaveformData {
    const sr = 100  // sampling rate Hz
    const duration = 60  // seconds
    const n = sr * duration
    const time = Array.from({ length: n }, (_, i) => i / sr)
    const bhz: number[] = [], bhn: number[] = [], bhe: number[] = []

    for (let i = 0; i < n; i++) {
      const t = time[i]
      // Background noise
      let vz = (Math.random() - 0.5) * 0.02
      let ns = (Math.random() - 0.5) * 0.02
      let ew = (Math.random() - 0.5) * 0.02

      // P-wave arrival at t=10s
      if (t > 10 && t < 18) {
        const amp = 0.8 * Math.exp(-(t - 12) * (t - 12) / 8)
        vz += amp * Math.sin(2 * Math.PI * 8 * t)
        ns += amp * 0.3 * Math.sin(2 * Math.PI * 8 * t + 0.5)
        ew += amp * 0.3 * Math.sin(2 * Math.PI * 8 * t + 1.0)
      }

      // S-wave arrival at t=22s
      if (t > 22 && t < 40) {
        const amp = 1.5 * Math.exp(-(t - 28) * (t - 28) / 30)
        vz += amp * 0.4 * Math.sin(2 * Math.PI * 4 * t)
        ns += amp * Math.sin(2 * Math.PI * 4 * t + 0.3)
        ew += amp * Math.sin(2 * Math.PI * 4 * t + 0.8)
      }

      // Surface waves at t=35s
      if (t > 35 && t < 55) {
        const amp = 2.0 * Math.exp(-(t - 42) * (t - 42) / 50)
        vz += amp * Math.sin(2 * Math.PI * 1.5 * t)
        ns += amp * Math.sin(2 * Math.PI * 1.5 * t + 0.4)
        ew += amp * Math.sin(2 * Math.PI * 1.5 * t + 0.9)
      }

      bhz.push(vz)
      bhn.push(ns)
      bhe.push(ew)
    }

    return { time, bhz, bhn, bhe, samplingRate: sr }
  }

  function loadMockData() {
    waveform.value = generateMockWaveform()
    picks.value = [
      { id: 'p1', type: 'P', time: 10.2, confidence: 0.92, method: 'STA/LTA' },
      { id: 'p2', type: 'S', time: 22.5, confidence: 0.88, method: 'STA/LTA' },
    ]
  }

  function staLtaPicking(): PhasePick[] {
    if (!waveform.value) return []
    const data = waveform.value.bhz
    const sr = waveform.value.samplingRate
    const staLen = Math.floor(staWindow.value * sr)
    const ltaLen = Math.floor(ltaWindow.value * sr)
    const newPicks: PhasePick[] = []

    let lta = 0
    for (let i = ltaLen; i < data.length - staLen; i++) {
      let sta = 0
      for (let j = 0; j < staLen; j++) sta += data[i + j] * data[i + j]
      sta /= staLen

      lta = 0
      for (let j = 0; j < ltaLen; j++) lta += data[i - j] * data[i - j]
      lta /= ltaLen

      const ratio = lta > 0 ? sta / lta : 0
      if (ratio > threshold.value) {
        const t = waveform.value.time[i]
        const existsNear = newPicks.some(p => Math.abs(p.time - t) < 2)
        if (!existsNear) {
          newPicks.push({
            id: `pick_${Date.now()}_${i}`,
            type: newPicks.length === 0 ? 'P' : 'S',
            time: t,
            confidence: Math.min(1, ratio / 10),
            method: 'STA/LTA'
          })
        }
      }
    }
    return newPicks
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }

  async function pollTaskStatus(taskId: string) {
    try {
      const resp = await fetch(`/api/waveform/task/${taskId}`)
      if (resp.ok) {
        const task: ProcessingTask = await resp.json()
        currentTask.value = task

        if (task.status === 'completed' && task.result) {
          waveform.value = task.result.waveform
          picks.value = task.result.picks || []
          stopPolling()
          addToHistory(task)
        } else if (task.status === 'failed') {
          stopPolling()
          addToHistory(task)
        }
      }
    } catch (e) {
      console.error('轮询任务状态失败:', e)
    }
  }

  function addToHistory(task: ProcessingTask) {
    const exists = taskHistory.value.find(t => t.id === task.id)
    if (!exists) {
      taskHistory.value.unshift({ ...task })
      if (taskHistory.value.length > 10) {
        taskHistory.value.pop()
      }
    }
  }

  function clearCurrentTask() {
    stopPolling()
    currentTask.value = null
  }

  function loadTaskResult(task: ProcessingTask) {
    if (task.result) {
      waveform.value = task.result.waveform
      picks.value = task.result.picks || []
    }
  }

  async function uploadAndAnalyze(file: File) {
    isLoading.value = true
    clearCurrentTask()
    try {
      const formData = new FormData()
      formData.append('file', file)
      const resp = await fetch('/api/waveform/upload', { method: 'POST', body: formData })
      if (resp.ok) {
        const data: UploadResponse = await resp.json()
        currentTask.value = {
          id: data.task_id,
          filename: data.filename,
          file_size: data.file_size,
          status: 'pending',
          stage: '上传文件',
          progress: 0,
          message: data.message,
          created_at: Date.now() / 1000,
          updated_at: Date.now() / 1000,
        }
        pollInterval = window.setInterval(() => pollTaskStatus(data.task_id), 500)
      } else {
        throw new Error('上传失败')
      }
    } catch {
      loadMockData()
    } finally {
      isLoading.value = false
    }
  }

  return {
    waveform, picks, selectedStation, staWindow, ltaWindow, threshold,
    isLoading, events, stations, currentTask, taskHistory, isProcessing,
    loadMockData, staLtaPicking, uploadAndAnalyze, generateMockWaveform,
    clearCurrentTask, loadTaskResult
  }
})
