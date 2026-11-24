import { musicTracks } from './music-tracks'
import { natureTracks } from './nature-tracks'
import type { Recording } from './recording'

type Noise = 'rain' | 'sea' | 'wind'
export type SoundGroup = 'music' | 'nature'
export interface Environment {
  id: string
  name: string
  icon: string
  group: SoundGroup
  recording?: Recording
  noise?: Noise
}

export const environments: Environment[] = [
  ...musicTracks.map(recording => choice(recording, 'music', 'headphones')),
  ...natureTracks.map(recording => choice(recording, 'nature', recording.id === 'nature-stream' ? 'waves' : 'leaf')),
  { id: 'rain', name: 'Stille regn', icon: 'cloud-rain', group: 'nature', noise: 'rain' },
  { id: 'sea', name: 'Havbrus', icon: 'waves', group: 'nature', noise: 'sea' },
  { id: 'wind', name: 'Skovvind', icon: 'wind', group: 'nature', noise: 'wind' },
]

function choice(recording: Recording, group: SoundGroup, icon: string): Environment {
  return { id: recording.id, name: recording.name, icon, group, recording }
}

interface Playback {
  sound: Environment
  audio: AudioContext
  gain: GainNode
  media?: HTMLAudioElement
}
let active: Playback | null = null
let level = 0.35
let speaking = false
let desktopSpeaking = false
try {
  const stored = localStorage.getItem('aandehul.ambient.volume')
  if (stored !== null && Number.isFinite(Number(stored))) level = Math.max(0, Math.min(1, Number(stored)))
} catch { /* The volume control also works without storage. */ }

export const ambientState = () => ({ selected: active?.sound.id ?? 'off', level })

function adjustGain(seconds: number) {
  if (!active) return
  const mix = active.sound.noise ? 0.48 : 1
  active.gain.gain.setTargetAtTime(level * mix * (speaking || desktopSpeaking ? 0.45 : 1), active.audio.currentTime, seconds)
}

export function setCompanionSpeaking(active: boolean) {
  desktopSpeaking = active
  adjustGain(active ? 0.07 : 0.28)
}

export function setLevel(value: number) {
  level = Math.max(0, Math.min(1, value))
  adjustGain(0.075)
  try { localStorage.setItem('aandehul.ambient.volume', String(level)) } catch { /* Session only. */ }
}

window.addEventListener('aandehul:pebble-speaking', event => {
  speaking = (event as CustomEvent<boolean>).detail
  adjustGain(speaking ? 0.07 : 0.28)
})

function noiseSource(noiseId: Noise, audio: AudioContext, gain: GainNode) {
  const buffer = audio.createBuffer(1, audio.sampleRate * 5, audio.sampleRate)
  const samples = buffer.getChannelData(0)
  let smooth = 0
  for (let i = 0; i < samples.length; i++) {
    const white = Math.random() * 2 - 1
    smooth = (smooth + white * 0.035) / 1.035
    samples[i] = noiseId === 'rain' ? white * 0.55 + smooth : smooth * 4
  }
  const noise = audio.createBufferSource()
  noise.buffer = buffer
  noise.loop = true
  const filter = audio.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.45
  filter.frequency.value = noiseId === 'rain' ? 2350 : noiseId === 'sea' ? 1150 : 720
  const pulse = audio.createGain()
  pulse.gain.value = noiseId === 'rain' ? 0.75 : 0.60
  const wave = audio.createOscillator()
  const depth = audio.createGain()
  depth.gain.value = noiseId === 'rain' ? 0.07 : noiseId === 'sea' ? 0.38 : 0.21
  wave.frequency.value = noiseId === 'sea' ? 0.093 : 0.062
  wave.connect(depth).connect(pulse.gain)
  noise.connect(filter).connect(pulse).connect(gain)
  wave.start()
  noise.start()
}

function release(playback: Playback) {
  const { audio, gain, media } = playback
  gain.gain.setTargetAtTime(0, audio.currentTime, 0.04)
  if (media) media.onerror = null
  window.setTimeout(() => {
    if (media) { media.pause(); media.removeAttribute('src'); media.load() }
    void audio.close().catch(() => {})
  }, 200)
}

function notifyChange(error = false) {
  window.dispatchEvent(new CustomEvent('aandehul:ambient-change', { detail: { error } }))
}

export async function setEnvironment(id: string) {
  const sound = environments.find(item => item.id === id)
  if (id !== 'off' && !sound) return
  if (active) { const old = active; active = null; release(old) }
  if (!sound) { notifyChange(); return }

  let playback: Playback | null = null
  try {
    const audio = new AudioContext()
    const gain = audio.createGain()
    gain.gain.value = 0
    gain.connect(audio.destination)
    playback = { sound, audio, gain }
    active = playback
    notifyChange()
    // Start both audio APIs inside the click so touch browsers retain the user gesture.
    const resume = audio.resume()
    if (sound.recording) {
      const media = new Audio(sound.recording.src)
      media.loop = true
      playback.media = media
      audio.createMediaElementSource(media).connect(gain)
      media.onerror = () => {
        if (active !== playback || !playback) return
        active = null
        release(playback)
        notifyChange(true)
      }
      await Promise.all([resume, media.play()])
    } else if (sound.noise) {
      await resume
      if (active === playback) noiseSource(sound.noise, audio, gain)
    }
    if (active === playback) adjustGain(0.2)
  } catch {
    if (active !== playback) return
    active = null
    if (playback) release(playback)
    notifyChange(true)
  }
}

window.addEventListener('pagehide', () => { if (active) void setEnvironment('off') })
