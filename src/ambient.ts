export const environments = [
  { id: 'off', name: 'Stilhed', icon: 'volume-x' },
  { id: 'rain', name: 'Stille regn', icon: 'cloud-rain' },
  { id: 'sea', name: 'Havbrus', icon: 'waves' },
  { id: 'wind', name: 'Skovvind', icon: 'wind' },
] as const

export type EnvironmentId = typeof environments[number]['id']
let selected: EnvironmentId = 'off'
let context: AudioContext | null = null
let volumeNode: GainNode | null = null
let revision = 0
let level = 0.35
try {
  const stored = localStorage.getItem('aandehul.ambient.volume')
  if (stored !== null && Number.isFinite(Number(stored))) level = Math.max(0, Math.min(1, Number(stored)))
} catch { /* Volume works for this visit when storage is unavailable. */ }

export const ambientState = () => ({ selected, level })

export function setLevel(value: number) {
  level = Math.max(0, Math.min(1, value))
  if (context && volumeNode) volumeNode.gain.setTargetAtTime(level * 0.48, context.currentTime, 0.12)
  try { localStorage.setItem('aandehul.ambient.volume', String(level)) } catch { /* Session only. */ }
}

export async function setEnvironment(id: EnvironmentId): Promise<void> {
  const ticket = ++revision
  const previous = context
  if (previous && volumeNode) {
    volumeNode.gain.setTargetAtTime(0, previous.currentTime, 0.045)
    window.setTimeout(() => { void previous.close().catch(() => {}) }, 200)
  }
  context = null
  volumeNode = null
  selected = 'off'
  if (id === 'off') return

  const audio = new AudioContext()
  try {
    await audio.resume()
    if (ticket !== revision) { await audio.close(); return }
    const buffer = audio.createBuffer(1, audio.sampleRate * 5, audio.sampleRate)
    const samples = buffer.getChannelData(0)
    let smooth = 0
    for (let i = 0; i < samples.length; i++) {
      const white = Math.random() * 2 - 1
      smooth = (smooth + white * 0.035) / 1.035
      samples[i] = id === 'rain' ? white * 0.55 + smooth : smooth * 4
    }
    const noise = audio.createBufferSource()
    noise.buffer = buffer
    noise.loop = true
    const filter = audio.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.45
    filter.frequency.value = id === 'rain' ? 2350 : id === 'sea' ? 1150 : 720
    const pulse = audio.createGain()
    pulse.gain.value = id === 'rain' ? 0.75 : 0.60
    const wave = audio.createOscillator()
    const depth = audio.createGain()
    depth.gain.value = id === 'rain' ? 0.07 : id === 'sea' ? 0.38 : 0.21
    wave.frequency.value = id === 'sea' ? 0.093 : 0.062
    wave.connect(depth).connect(pulse.gain)
    const gain = audio.createGain()
    gain.gain.value = 0
    noise.connect(filter).connect(pulse).connect(gain).connect(audio.destination)
    context = audio
    volumeNode = gain
    selected = id
    wave.start()
    noise.start()
    gain.gain.setTargetAtTime(level * 0.48, audio.currentTime, 0.40)
  } catch (err) {
    if (audio.state !== 'closed') void audio.close().catch(() => {})
    throw err
  }
}
