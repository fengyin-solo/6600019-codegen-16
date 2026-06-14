<template>
  <div class="flex h-screen">
    <!-- Sidebar -->
    <div class="w-72 bg-gray-900 p-4 flex flex-col gap-3 border-r border-gray-800 overflow-y-auto">
      <h1 class="text-lg font-bold text-cyan-400">地震波形 P/S 波分析</h1>

      <div>
        <label class="block text-center py-2 rounded cursor-pointer text-sm font-medium transition-colors"
               :class="store.isProcessing 
                 ? 'bg-gray-600 text-gray-400 cursor-not-allowed' 
                 : 'bg-cyan-500 text-black hover:bg-cyan-400'">
          <span v-if="store.isProcessing">处理中，请稍候...</span>
          <span v-else>上传 SAC/miniSEED</span>
          <input type="file" @change="onUpload" class="hidden" :disabled="store.isProcessing" />
        </label>
      </div>
      <button @click="store.loadMockData()" 
              class="bg-gray-800 py-2 rounded text-sm hover:bg-gray-700 transition-colors"
              :disabled="store.isProcessing"
              :class="{ 'opacity-50 cursor-not-allowed': store.isProcessing }">
        加载模拟数据
      </button>

      <ProgressIndicator />

      <!-- STA/LTA Parameters -->
      <div class="bg-gray-800 rounded-xl p-3 space-y-2">
        <h3 class="text-cyan-300 font-bold text-sm">STA/LTA 参数</h3>
        <div>
          <label class="text-gray-400 text-xs">STA 窗口: {{ store.staWindow.toFixed(1) }}s</label>
          <input type="range" v-model.number="store.staWindow" min="0.5" max="5" step="0.1" class="w-full" />
        </div>
        <div>
          <label class="text-gray-400 text-xs">LTA 窗口: {{ store.ltaWindow.toFixed(1) }}s</label>
          <input type="range" v-model.number="store.ltaWindow" min="5" max="30" step="0.5" class="w-full" />
        </div>
        <div>
          <label class="text-gray-400 text-xs">触发阈值: {{ store.threshold.toFixed(1) }}</label>
          <input type="range" v-model.number="store.threshold" min="1" max="10" step="0.5" class="w-full" />
        </div>
        <button @click="runPick" 
                class="w-full bg-cyan-600 py-2 rounded text-sm hover:bg-cyan-500 transition-colors"
                :disabled="store.isProcessing || !store.waveform"
                :class="{ 'opacity-50 cursor-not-allowed': store.isProcessing || !store.waveform }">
          运行自动拾取
        </button>
      </div>

      <!-- Picks -->
      <div class="bg-gray-800 rounded-xl p-3">
        <h3 class="text-cyan-300 font-bold text-sm mb-2">震相拾取结果</h3>
        <div v-for="p in store.picks" :key="p.id" class="flex justify-between bg-gray-700 rounded p-2 mb-1 text-sm">
          <span :class="p.type === 'P' ? 'text-red-400' : 'text-blue-400'">{{ p.type }} 波</span>
          <span>{{ p.time.toFixed(2) }}s</span>
          <span class="text-gray-400">{{ (p.confidence * 100).toFixed(0) }}%</span>
        </div>
        <div v-if="!store.picks.length" class="text-gray-600 text-xs">加载数据后运行拾取</div>
      </div>

      <!-- Stations -->
      <div class="bg-gray-800 rounded-xl p-3">
        <h3 class="text-cyan-300 font-bold text-sm mb-2">台站分布</h3>
        <div v-for="s in store.stations" :key="s.id"
          @click="store.selectedStation = s"
          class="bg-gray-700 rounded p-2 mb-1 text-sm cursor-pointer hover:bg-gray-600 transition-colors"
          :class="store.selectedStation?.id === s.id ? 'ring-1 ring-cyan-500' : ''">
          {{ s.name }} <span class="text-gray-400 text-xs">({{ s.latitude.toFixed(1) }}, {{ s.longitude.toFixed(1) }})</span>
        </div>
      </div>

      <!-- Events -->
      <div class="bg-gray-800 rounded-xl p-3">
        <h3 class="text-cyan-300 font-bold text-sm mb-2">地震事件目录</h3>
        <div v-for="e in store.events" :key="e.id" class="bg-gray-700 rounded p-2 mb-1 text-xs">
          M{{ e.magnitude }} {{ e.location }}
          <div class="text-gray-500">深度 {{ e.depth }}km | {{ e.originTime.slice(0, 16) }}</div>
        </div>
      </div>
    </div>

    <!-- Main: Waveform Charts -->
    <div class="flex-1 flex flex-col gap-2 p-4 overflow-y-auto">
      <WaveformChart v-if="store.waveform" />
      <div v-else class="flex-1 flex flex-col items-center justify-center text-gray-600">
        <div class="text-4xl mb-4">📊</div>
        <div>请上传数据或加载模拟波形</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSeismicStore } from './store/seismic'
import WaveformChart from './components/WaveformChart.vue'
import ProgressIndicator from './components/ProgressIndicator.vue'

const store = useSeismicStore()

function onUpload(e: Event) {
  if (store.isProcessing) return
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) store.uploadAndAnalyze(file)
  ;(e.target as HTMLInputElement).value = ''
}

function runPick() {
  if (store.isProcessing || !store.waveform) return
  store.picks = store.staLtaPicking()
}
</script>
