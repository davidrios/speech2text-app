<script setup lang="ts">
import { QInput, useQuasar } from 'quasar'
import { promptFile, sleep } from '../utils/misc'
import { onBeforeUnmount, onMounted, ref } from 'vue'

const $q = useQuasar()

if (window.electronAPI != null) {
  if (!window.isCallbackRegistered.handleStartStopRecording) {
    window.electronAPI.handleStartStopRecording(() => {
      clickRecord()
    })
    window.isCallbackRegistered.handleStartStopRecording = true
  }

  if (!window.isCallbackRegistered.handleOpenSettings) {
    window.electronAPI.handleOpenSettings(() => {
      showSettings.value = true
    })
    window.isCallbackRegistered.handleOpenSettings = true
  }
}

interface Message {type: string, content: string}
interface Settings {
  serverAddress: string
  isTls: boolean
  autoCopy: boolean
  globalShortcut: string | null
}

const isConnected = ref(false)
let ws: WebSocket
const received: Message[] = []

function readSettings (): Settings {
  return JSON.parse(localStorage.getItem('settings') ?? 'null') || {
    serverAddress: 'localhost:9748',
    isTls: false,
    autoCopy: false
  }
}

function connect () {
  if (ws != null) {
    ws.close()
  }

  ws = new WebSocket(`${settings.value.isTls ? 'wss' : 'ws'}://${settings.value.serverAddress}/api/transcribe`)
  ws.onopen = () => {
    isConnected.value = true
  }
  ws.onclose = () => {
    isConnected.value = false
  }

  ws.onmessage = function (event) {
    received.push(JSON.parse(event.data))
  }
}

function handleShortcuts (event: KeyboardEvent) {
  if (event.ctrlKey && event.code === 'KeyS') {
    event.preventDefault()
    if (isRecording.value) {
      stopRecording()
    } else {
      startRecording()
    }
  }
}

let connectionRetrier: number
onMounted(() => {
  connect()

  document.addEventListener('keydown', handleShortcuts)

  settings.value = readSettings()
  if (window.electronAPI != null) {
    registerGlobalShortcut()
  }

  connectionRetrier = window.setInterval(() => {
    if (!isConnected.value) {
      connect()
    }
  }, 3000)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleShortcuts)
  clearInterval(connectionRetrier)
})

const isShortcutValid = ref(false)
function onShortcutSettingsKeyDown (event: KeyboardEvent) {
  console.log(event)
  event.preventDefault()

  if (event.key === 'Delete' || event.key === 'Backspace') {
    settings.value.globalShortcut = null
    return
  }

  const shortcut: string[] = []
  if (event.ctrlKey) {
    shortcut.push('Ctrl')
  }
  if (event.altKey) {
    shortcut.push('Alt')
  }
  if (event.shiftKey) {
    shortcut.push('Shift')
  }

  if (event.key !== 'Control' && event.key !== 'Alt' && event.key !== 'Shift') {
    if (shortcut.length === 0) {
      isShortcutValid.value = false
      return
    }

    if (event.code.startsWith('Key')) {
      shortcut.push(event.key.toUpperCase())
    } else {
      shortcut.push(event.key)
    }

    isShortcutValid.value = true
  }

  settings.value.globalShortcut = shortcut.join('+')
}

function onShortcutSettingsKeyUp () {
  if (!isShortcutValid.value) {
    settings.value.globalShortcut = null
  }
}

async function registerGlobalShortcut () {
  const success = await window.electronAPI.registerGlobalShortcut(settings.value.globalShortcut)
  if (!success) {
    $q.notify({ message: 'Error registering global shortcut.', color: 'red' })
  }
}

const settings = ref<Settings>(readSettings())

function saveSettings () {
  const currentSettings = readSettings()
  localStorage.setItem('settings', JSON.stringify(settings.value))
  if (currentSettings.serverAddress !== settings.value.serverAddress || currentSettings.isTls !== settings.value.isTls) {
    connect()
  }
}

async function receiveNext (): Promise<Message> {
  while (true) {
    if (received.length > 0) {
      break
    }

    await sleep(500)
  }

  const message = received.pop() as Message
  return message
}

const responseHistory = ref<string[]>(JSON.parse(localStorage.getItem('history') ?? '[]'))
const output = ref(responseHistory.value.length > 0 ? responseHistory.value[responseHistory.value.length - 1] : '')
const currentPosition = ref(responseHistory.value.length - 1)

const outputInput = ref<QInput>()
async function copyText () {
  if (outputInput.value == null) {
    return
  }

  try {
    await navigator.clipboard.writeText(output.value)
    $q.notify('Copied to clipboard')
  } catch {
    console.log('error')
  }
}

function showPrevious () {
  currentPosition.value = Math.max(currentPosition.value - 1, 0)
  output.value = responseHistory.value[currentPosition.value]
}

function showNext () {
  currentPosition.value = Math.min(currentPosition.value + 1, responseHistory.value.length - 1)
  output.value = responseHistory.value[currentPosition.value]
}

const showSettings = ref(false)

const isLoading = ref(false)

async function transcribe (audioData: Blob) {
  isLoading.value = true

  try {
    ws.send(JSON.stringify({ type: 'TRANSCRIBE' }))

    let message = await receiveNext()
    if (message.type !== 'PROCEED_WITH_FILE') {
      output.value = '** unexpected response **'
      isLoading.value = false
      return
    }

    const reader = new FileReader()
    const fileLoaded: Promise<ArrayBuffer> = new Promise((resolve, reject) => {
      reader.onload = function (event) {
        resolve(event.target?.result as ArrayBuffer)
      }
      reader.onerror = function () {
        reject(reader.error)
      }
    })
    reader.readAsArrayBuffer(audioData)

    ws.send(await fileLoaded)

    message = await receiveNext()
    switch (message.type) {
      case 'TRANSCRIPT':
        output.value = message.content
        responseHistory.value.push(message.content)
        if (responseHistory.value.length > 500) {
          responseHistory.value.shift()
        }
        localStorage.setItem('history', JSON.stringify(responseHistory.value))
        currentPosition.value = responseHistory.value.length - 1
        break
      case 'TRANSCRIPTION_ERROR':
        output.value = 'ERROR: ' + message.content
        break
      default:
        output.value = '** unexpected response **'
    }

    if (settings.value.autoCopy) {
      try {
        await navigator.clipboard.writeText(output.value)
        $q.notify('Copied to clipboard')
      } catch {
        console.log('error')
      }
    }
  } catch (err) {
    console.log(err)
    $q.notify({ message: 'Error while processing the request.', color: 'red' })
  } finally {
    isLoading.value = false
  }
}

async function uploadAudio () {
  await transcribe(await promptFile('audio/*', false) as File)
}

const isRecording = ref(false)
const currentRecording = ref(0)
let mediaRecorder: MediaRecorder

async function startRecording () {
  isRecording.value = true
  currentRecording.value += 1
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

  const recording: Promise<Blob> = new Promise((resolve, reject) => {
    const chunks: Blob[] = []
    mediaRecorder = new MediaRecorder(stream)

    mediaRecorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data)
      }
    })

    mediaRecorder.addEventListener('stop', () => {
      const audioBlob = new Blob(chunks, { type: 'audio/wav' })
      chunks.length = 0
      resolve(audioBlob)
    })

    mediaRecorder.start()
  })

  const recordingId = currentRecording.value.toString()
  console.log('id', recordingId)
  setTimeout(async () => {
    console.log('id, current', recordingId, currentRecording.value.toString())
    if (isRecording.value && recordingId === currentRecording.value.toString()) {
      await stopRecording()
      $q.notify('Recording time exceeded 1m, forcing stop.')
    }
  }, 60000)

  const blob = await recording
  stream.getTracks().forEach((track) => track.stop())

  isRecording.value = false

  await transcribe(blob)
}

async function stopRecording () {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
}

function clickRecord () {
  if (isRecording.value) {
    stopRecording()
  } else {
    startRecording()
  }
}
</script>

<template>
  <q-page class="q-pa-sm flex column">
    <q-dialog
      v-model="showSettings"
      persistent
    >
      <q-card style="min-width: 350px">
        <q-card-section>
          <div class="text-h6">
            Settings
          </div>
        </q-card-section>

        <q-card-section class="q-pt-none q-col-gutter-sm">
          <q-input
            v-model="settings.serverAddress"
            dense
            label="Server address"
          />
          <div>
            <q-toggle
              v-model="settings.isTls"
              label="HTTPS"
            />
          </div>
          <div>
            <q-toggle
              v-model="settings.autoCopy"
              label="Auto copy responses"
            />
          </div>
          <q-input
            v-model="settings.globalShortcut"
            label="Global start/stop voice recording shortcut"
            clearable
            dense
            @keydown="onShortcutSettingsKeyDown"
            @keyup="onShortcutSettingsKeyUp"
          />
        </q-card-section>

        <q-card-actions
          align="right"
          class="text-primary"
        >
          <q-btn
            v-close-popup
            flat
            label="Ok"
            @click="saveSettings"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <div class="row col-grow">
      <q-input
        ref="outputInput"
        v-model="output"
        type="textarea"
        class="col text-area"
        style="width: 500px"
        filled
      />
    </div>
    <div class="row q-pt-sm fit">
      <div class="col-6">
        <div class="row q-col-gutter-xs">
          <div>
            <q-btn
              icon="content_copy"
              dense
              @click="copyText"
            />
          </div>
          <div>
            <q-btn
              icon="navigate_before"
              dense
              :disable="currentPosition <= 0"
              @click="showPrevious"
            />
          </div>
          <div>
            <q-btn
              icon="navigate_next"
              dense
              :disable="currentPosition >= responseHistory.length - 1"
              @click="showNext"
            />
          </div>
          <div>
            <q-btn
              icon="settings"
              dense
              @click="showSettings = true"
            />
          </div>
        </div>
      </div>
      <div class="col-6">
        <div class="row q-col-gutter-xs justify-end">
          <div>
            <q-chip
              :color="isConnected ? 'green' : undefined"
              :text-color="isConnected ? 'white' : undefined"
            >
              {{ isConnected ? 'online' : 'offline' }}
            </q-chip>
          </div>
          <div>
            <q-btn
              icon="upload_file"
              dense
              :loading="isLoading"
              :disable="!isConnected"
              @click="uploadAudio"
            />
          </div><div>
            <q-btn
              color="primary"
              dense
              :loading="isLoading"
              :disable="!isConnected"
              @click="clickRecord"
            >
              <q-spinner-bars v-if="isRecording" />
              <q-icon
                v-else
                name="record_voice_over"
              />
            </q-btn>
          </div>
        </div>
      </div>
    </div>
  </q-page>
</template>

<style lang="scss">
.text-area {
  .q-field__control {
    height: 100%;
  }
}
</style>
