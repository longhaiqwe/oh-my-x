export const MAX_VOICE_REPLY_MS = 30_000
export const MIN_VOICE_REPLY_MS = 1_000

const MIME_TYPE = 'video/mp4;codecs=avc1.42001f,mp4a.40.2'
const FRAME_RATE = 30

interface VoiceCaptureOptions {
  signal: AbortSignal
  label: string
  onInterrupted: () => void
}

export interface VoiceCapture {
  stop(): Promise<Blob>
}

export function supportsVoiceCapture(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === 'function'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function'
    && typeof MediaRecorder !== 'undefined'
    && MediaRecorder.isTypeSupported(MIME_TYPE)
}

function drawCover(canvas: HTMLCanvasElement, label: string): () => void {
  canvas.width = 640
  canvas.height = 360
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')
  const bars = [16, 30, 48, 30, 16]
  return () => {
    ctx.fillStyle = '#182635'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#f4f7fa'
    bars.forEach((height, index) => {
      ctx.beginPath()
      ctx.roundRect(278 + 18 * index, 154 - height / 2, 12, height, 6)
      ctx.fill()
    })
    ctx.font = '600 28px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(label, 320, 226)
  }
}

export async function startVoiceCapture({ signal, label, onInterrupted }: VoiceCaptureOptions): Promise<VoiceCapture> {
  signal.throwIfAborted()
  const microphone = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 }, video: false })
  let canvasStream: MediaStream | undefined
  let frames: ReturnType<typeof setInterval> | undefined
  const releaseTracks = () => {
    clearInterval(frames)
    microphone.getTracks().forEach(track => track.stop())
    canvasStream?.getTracks().forEach(track => track.stop())
  }

  try {
    signal.throwIfAborted()
    const audio = microphone.getAudioTracks()[0]
    if (!audio || audio.readyState !== 'live') throw new Error('Microphone audio is unavailable')

    const canvas = document.createElement('canvas')
    const draw = drawCover(canvas, label)
    draw()
    canvasStream = canvas.captureStream(FRAME_RATE)
    const video = canvasStream.getVideoTracks()[0]
    if (!video) throw new Error('Cover video is unavailable')

    const recorder = new MediaRecorder(new MediaStream([video, audio]), {
      mimeType: MIME_TYPE,
      audioBitsPerSecond: 128_000,
      videoBitsPerSecond: 600_000,
    })
    const chunks: Blob[] = []
    let stopping = false
    let resolveFile!: (blob: Blob) => void
    let rejectFile!: (error: unknown) => void
    const result = new Promise<Blob>((resolve, reject) => {
      resolveFile = resolve
      rejectFile = reject
    })
    // 浏览器也可能在用户按「停止」以前终止录制。
    void result.catch(() => {})

    const cleanup = () => {
      signal.removeEventListener('abort', abort)
      audio.removeEventListener('ended', interrupt)
      releaseTracks()
    }
    const stopRecorder = () => {
      stopping = true
      if (recorder.state !== 'inactive') recorder.stop()
      cleanup()
    }
    const abort = () => {
      rejectFile(signal.reason)
      stopRecorder()
    }
    const interrupt = () => {
      rejectFile(new Error('Recording was interrupted'))
      stopRecorder()
      onInterrupted()
    }
    recorder.addEventListener('dataavailable', event => {
      if (!signal.aborted && event.data.size) chunks.push(event.data)
    })
    recorder.addEventListener('error', interrupt)
    recorder.addEventListener('stop', () => {
      cleanup()
      if (!stopping) {
        rejectFile(new Error('Recording stopped unexpectedly'))
        onInterrupted()
      } else if (!chunks.length) {
        rejectFile(new Error('Recording is empty'))
      } else {
        resolveFile(new Blob(chunks, { type: 'video/mp4' }))
      }
    }, { once: true })
    recorder.start()
    audio.addEventListener('ended', interrupt, { once: true })
    signal.addEventListener('abort', abort, { once: true })
    // 连续绘制同一张封面，为整段录音生成可播放的视频轨。
    frames = setInterval(draw, 1000 / FRAME_RATE)
    return {
      stop() {
        stopRecorder()
        return result
      },
    }
  } catch (error) {
    releaseTracks()
    throw error
  }
}
