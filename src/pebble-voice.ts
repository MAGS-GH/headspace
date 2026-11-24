export type PebbleVoiceClip = 'greeting' | 'welcome' | 'little-stone' | 'inhale' | 'exhale' | 'pause' | 'complete'

const guidedExercises = new Map([
  ['kropsscanning', 6],
  ['giv-slip-paa-dagen', 5],
  ['et-roligt-oejeblik', 4],
  ['lette-skuldre', 5],
])

let player: HTMLAudioElement | undefined
let generation = 0
let currentClip = ''
let speaking = false
let mouthTimer: number | undefined
let mouthIndex: { stepMs: number; clips: Record<string, string> } | undefined
let mouthRequest: Promise<void> | undefined
let lastJaw = -1

function setJaw(value: number): void {
  if (lastJaw === value) return
  lastJaw = value
  document.documentElement.style.setProperty('--pebble-jaw', String(value))
}

function updateJaw(): void {
  if (!player || !speaking) return
  const samples = mouthIndex?.clips[currentClip]
  if (samples && mouthIndex) {
    const index = Math.floor(player.currentTime * 1000 / mouthIndex.stepMs)
    const digit = Number(samples[index] ?? 0)
    setJaw(Number.isFinite(digit) ? digit / 9 : 0)
  } else {
    setJaw(0.28 + 0.14 * Math.sin(player.currentTime * 17))
  }
}

function setSpeaking(active: boolean): void {
  if (speaking === active) return
  speaking = active
  if (active) {
    updateJaw()
    mouthTimer = window.setInterval(updateJaw, 40)
  } else {
    clearInterval(mouthTimer)
    setJaw(0)
  }
  window.dispatchEvent(new CustomEvent('aandehul:pebble-speaking', { detail: active }))
}

function createPlayer(): HTMLAudioElement {
  const media = new Audio()
  media.volume = 0.84
  media.addEventListener('playing', () => setSpeaking(!media.paused))
  for (const event of ['pause', 'waiting', 'abort']) {
    media.addEventListener(event, () => setSpeaking(false))
  }
  const finish = () => {
    if (!currentClip) return
    const finished = currentClip
    currentClip = ''
    setSpeaking(false)
    window.dispatchEvent(new CustomEvent('aandehul:pebble-voice-ended', { detail: finished }))
  }
  media.addEventListener('ended', () => { if (media.ended) finish() })
  media.addEventListener('error', () => { if (media.error) finish() })
  window.addEventListener('pagehide', stopPebbleVoice)
  return media
}

async function loadMouthIndex(): Promise<void> {
  try {
    const response = await fetch('/voice/mouth.json')
    if (!response.ok) return
    const data = await response.json()
    if (Number.isFinite(data?.stepMs) && data.stepMs > 0 && data.clips) mouthIndex = data
  } catch { /* Playback remains available if only the animation data is missing. */ }
}

// Keep one media element so the browser can reuse the initial user gesture for later cues.
async function playClip(filename: string): Promise<boolean> {
  const requested = ++generation
  player ??= createPlayer()
  player.pause()
  setSpeaking(false)
  mouthRequest ??= loadMouthIndex()
  currentClip = filename
  player.src = `/voice/${filename}.mp3`
  try {
    await player.play()
    return requested === generation
  } catch {
    // A newer cue or a closed session can interrupt a pending playback request.
    return false
  }
}

export function playPebbleVoice(clip: PebbleVoiceClip): Promise<boolean> {
  return playClip(clip)
}

export function playPebbleStep(exerciseId: string, index: number): Promise<boolean> {
  if (!Number.isInteger(index) || index < 0) return Promise.resolve(false)
  if (exerciseId === 'rolig-vejrtraekning' || exerciseId === 'blid-udanding') {
    if (index > 1) return Promise.resolve(false)
    return playPebbleVoice(index === 0 ? 'inhale' : 'exhale')
  }
  if (index >= (guidedExercises.get(exerciseId) ?? 0)) return Promise.resolve(false)
  return playClip(`${exerciseId}-${index}`)
}

export function stopPebbleVoice(): void {
  generation++
  currentClip = ''
  player?.pause()
  setSpeaking(false)
}
