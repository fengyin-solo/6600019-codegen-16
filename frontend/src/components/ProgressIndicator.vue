<template>
  <div class="space-y-4">
    <div v-if="store.currentTask" 
         class="bg-gray-800 rounded-xl p-4 border border-gray-700">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-cyan-300 font-bold text-sm flex items-center gap-2">
          <span v-if="store.isProcessing" class="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
          <span v-else-if="store.currentTask.status === 'completed'" class="w-2 h-2 bg-green-400 rounded-full"></span>
          <span v-else class="w-2 h-2 bg-red-400 rounded-full"></span>
          分析进度
        </h3>
        <button @click="store.clearCurrentTask()" 
                class="text-gray-500 hover:text-gray-300 text-xs"
                v-if="!store.isProcessing">
          关闭
        </button>
      </div>

      <div class="text-xs text-gray-400 mb-2">
        {{ store.currentTask.filename }}
        <span class="text-gray-600 ml-2">
          ({{ formatFileSize(store.currentTask.file_size) }})
        </span>
      </div>

      <div class="relative h-2 bg-gray-700 rounded-full overflow-hidden mb-3">
        <div class="h-full rounded-full transition-all duration-300 ease-out"
             :class="progressBarClass"
             :style="{ width: `${store.currentTask.progress}%` }">
        </div>
      </div>

      <div class="flex items-center justify-between text-xs mb-2">
        <span class="text-gray-400">{{ store.currentTask.stage }}</span>
        <span class="font-mono" :class="progressTextClass">
          {{ store.currentTask.progress }}%
        </span>
      </div>

      <div class="text-xs text-gray-500 mb-3">
        {{ store.currentTask.message }}
      </div>

      <div v-if="store.currentTask.status === 'completed'" 
           class="pt-3 border-t border-gray-700">
        <div class="flex items-center gap-2">
          <button @click="viewResult" 
                  class="flex-1 bg-cyan-600 hover:bg-cyan-500 py-2 rounded text-sm font-medium transition-colors">
            查看分析结果
          </button>
          <button @click="store.clearCurrentTask()" 
                  class="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors">
            关闭
          </button>
        </div>
        <div v-if="store.currentTask.result?.picks?.length" 
             class="mt-3 text-xs text-gray-400">
          已拾取 {{ store.currentTask.result.picks.length }} 个震相
        </div>
      </div>

      <div v-if="store.currentTask.status === 'failed'" 
           class="pt-3 border-t border-gray-700">
        <div class="text-red-400 text-xs mb-2">{{ store.currentTask.message }}</div>
        <button @click="store.clearCurrentTask()" 
                class="w-full bg-gray-700 hover:bg-gray-600 py-2 rounded text-sm transition-colors">
          关闭
        </button>
      </div>
    </div>

    <div v-if="store.taskHistory.length > 0" class="bg-gray-800 rounded-xl p-4">
      <h3 class="text-cyan-300 font-bold text-sm mb-3">历史记录</h3>
      <div class="space-y-2 max-h-48 overflow-y-auto">
        <div v-for="task in store.taskHistory" :key="task.id"
             class="bg-gray-700 rounded p-3 text-xs cursor-pointer hover:bg-gray-600 transition-colors"
             @click="handleHistoryClick(task)">
          <div class="flex items-center justify-between mb-1">
            <span class="text-gray-300 truncate">{{ task.filename }}</span>
            <span :class="getStatusClass(task.status)" class="shrink-0 ml-2">
              {{ getStatusText(task.status) }}
            </span>
          </div>
          <div class="flex items-center justify-between text-gray-500">
            <span>{{ formatFileSize(task.file_size) }}</span>
            <span>{{ formatTime(task.updated_at) }}</span>
          </div>
          <div v-if="task.status === 'completed' && task.result?.picks" 
               class="mt-1 text-cyan-400">
            {{ task.result.picks.length }} 个震相
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSeismicStore } from '../store/seismic'
import type { ProcessingTask, TaskStatus } from '../types'

const store = useSeismicStore()

const progressBarClass = computed(() => {
  if (!store.currentTask) return 'bg-gray-500'
  switch (store.currentTask.status) {
    case 'completed':
      return 'bg-green-500'
    case 'failed':
      return 'bg-red-500'
    default:
      return 'bg-gradient-to-r from-cyan-500 to-blue-500'
  }
})

const progressTextClass = computed(() => {
  if (!store.currentTask) return 'text-gray-400'
  switch (store.currentTask.status) {
    case 'completed':
      return 'text-green-400'
    case 'failed':
      return 'text-red-400'
    default:
      return 'text-cyan-400'
  }
})

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getStatusClass(status: TaskStatus): string {
  switch (status) {
    case 'completed':
      return 'text-green-400'
    case 'failed':
      return 'text-red-400'
    default:
      return 'text-yellow-400'
  }
}

function getStatusText(status: TaskStatus): string {
  switch (status) {
    case 'completed':
      return '已完成'
    case 'failed':
      return '失败'
    case 'uploading':
      return '上传中'
    case 'parsing':
      return '解析中'
    case 'analyzing':
      return '分析中'
    default:
      return '等待中'
  }
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function viewResult() {
  if (store.currentTask?.result) {
    store.waveform = store.currentTask.result.waveform
    store.picks = store.currentTask.result.picks || []
    store.clearCurrentTask()
  }
}

function handleHistoryClick(task: ProcessingTask) {
  if (task.status === 'completed' && task.result) {
    store.loadTaskResult(task)
  }
}
</script>
