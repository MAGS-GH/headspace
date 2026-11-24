import { currentCue, exercises, saveSession } from './coach'
import { icon } from './icon'
import './player.css'

const soundKey = 'aandehul.cue-sound.v1'
const speechKey = 'aandehul.cue-speech.v1'
let activePlayer: HTMLDialogElement | null = null

function clock(seconds: number): string {
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
}

function preference(key: string): boolean {
  try { return localStorage.getItem(key) === 'on' }
  catch { return false }
}

function setPreference(key: string, on: boolean) {
  try { localStorage.setItem(key, on ? 'on' : 'off') }
  catch { /* The button still works for this exercise. */ }
}

// A quiet two-part struck note. Everything is generated on the device.
function chime(context: AudioContext, frequency: number) {
  if (context.state !== 'running') return
  const start = context.currentTime
  for (const [ratio, volume, length] of [[1, 0.065, 1.65], [2, 0.012, 0.9]]) {
    const oscillator = context.createOscillator()
    const envelope = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency * ratio
    envelope.gain.setValueAtTime(0.0001, start)
    envelope.gain.exponentialRampToValueAtTime(volume, start + 0.055)
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + length)
    oscillator.connect(envelope).connect(context.destination)
    oscillator.start(start)
    oscillator.stop(start + length + 0.02)
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect() }
  }
}

export function openPlayer(exerciseId: string): void {
  const exercise = exercises.find(item => item.id === exerciseId)
  if (!exercise) return
  if (activePlayer) { activePlayer.focus(); return }

  const dialog = document.createElement('dialog')
  activePlayer = dialog
  dialog.className = 'coach-player'
  dialog.setAttribute('aria-labelledby', 'coach-exercise-title')
  dialog.innerHTML = `
    <div class="coach-sheet">
      <div class="coach-topline">
        <span class="coach-category"></span>
        <button type="button" class="coach-close" aria-label="Afslut og luk øvelsen" title="Afslut og luk">${icon('x')}</button>
      </div>
      <h2 id="coach-exercise-title"></h2>
      <div class="coach-orbit" aria-hidden="true">
        <div class="coach-orbit-rings"></div>
        <img class="coach-pebble" src="${import.meta.env.BASE_URL}images/pebble.png" alt="" />
      </div>
      <div class="coach-cue" aria-live="polite" aria-atomic="true">
        <h3></h3><p></p>
      </div>
      <div class="coach-session-controls">
        <div class="coach-time">
          <span class="coach-timer" role="timer" aria-label="Tid brugt">0:00</span>
          <progress class="coach-progress" aria-label="Forløbet tid"></progress>
          <span class="coach-total"></span>
        </div>
        <div class="coach-actions">
          <label class="coach-duration">Varighed
            <select aria-label="Varighed i minutter"></select>
          </label>
          <button type="button" class="coach-playback"></button>
          <button type="button" class="coach-sound" aria-pressed="false"></button>
        </div>
        <button type="button" class="coach-speech" aria-pressed="false" hidden>${icon('book-open')} Læs trin op</button>
      </div>
      <button type="button" class="coach-done" hidden>Tilbage til mit åndehul</button>
    </div>`

  const element = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!
  const orbit = element('.coach-orbit')
  const cueTitle = element('.coach-cue h3')
  const cueText = element('.coach-cue p')
  const sessionControls = element('.coach-session-controls')
  const playback = element<HTMLButtonElement>('.coach-playback')
  const close = element<HTMLButtonElement>('.coach-close')
  const done = element<HTMLButtonElement>('.coach-done')
  const sound = element<HTMLButtonElement>('.coach-sound')
  const speech = element<HTMLButtonElement>('.coach-speech')
  const duration = element<HTMLSelectElement>('select')
  const timer = element('.coach-timer')
  const total = element('.coach-total')
  const progress = element<HTMLProgressElement>('.coach-progress')
  element('.coach-category').textContent = exercise.category
  element('#coach-exercise-title').textContent = exercise.title
  duration.replaceChildren(...exercise.durations.map(minutes => new Option(minutes + ' min', String(minutes))))
  duration.value = String(exercise.minutes)

  const startedAt = new Date().toISOString()
  let targetSeconds = exercise.minutes * 60
  let accumulated = 0
  let runningSince: number | null = performance.now()
  let lastCue = -1
  let lastSecond = -1
  let soundOn = preference(soundKey) && typeof AudioContext !== 'undefined'
  let audio: AudioContext | undefined
  const synthesis = window.speechSynthesis
  let voice: SpeechSynthesisVoice | undefined
  let utterance: SpeechSynthesisUtterance | null = null
  let speechOn = preference(speechKey)
  let finished = false
  let closed = false
  let tick = 0

  function elapsed() {
    const current = runningSince === null ? 0 : (performance.now() - runningSince) / 1000
    return Math.min(targetSeconds, accumulated + current)
  }

  async function playNote(frequency: number) {
    if (!soundOn || typeof AudioContext === 'undefined') return
    try {
      audio ??= new AudioContext()
      if (audio.state === 'suspended') await audio.resume()
      if (!closed && soundOn && (runningSince !== null || finished)) chime(audio, frequency)
    } catch {
      if (!closed) {
        soundOn = false
        updateSound()
      }
    }
  }

  function updateSound() {
    sound.innerHTML = icon(soundOn ? 'volume-2' : 'volume-x') + '<span>Klange</span>'
    sound.setAttribute('aria-pressed', String(soundOn))
    sound.title = soundOn ? 'Slå guideklange fra' : 'Slå guideklange til'
    sound.setAttribute('aria-label', sound.title)
    sound.disabled = typeof AudioContext === 'undefined'
  }

  function stopSpeaking() {
    if (utterance) {
      utterance = null
      synthesis.cancel()
    }
  }

  function speakCue() {
    stopSpeaking()
    if (!voice || !speechOn || finished || closed || runningSince === null || lastCue < 0) return
    const step = exercise!.steps[lastCue]
    const text = exercise!.breath ? step.title : step.title + '. ' + step.instruction
    const next = new SpeechSynthesisUtterance(text)
    utterance = next
    next.voice = voice
    next.lang = voice.lang
    next.rate = 0.94
    next.onend = () => { if (utterance === next) utterance = null }
    next.onerror = event => {
      if (utterance !== next) return
      utterance = null
      if (event.error === 'canceled' || event.error === 'interrupted') return
      speechOn = false
      speech.setAttribute('aria-pressed', 'false')
      speech.title = 'Stemmen kunne ikke starte. Prøv igen.'
    }
    synthesis.speak(next)
  }

  function refreshVoices() {
    const previousVoice = voice?.voiceURI
    voice = synthesis?.getVoices().find(candidate => candidate.localService && /^da(?:[-_]|$)/i.test(candidate.lang))
    speech.hidden = !voice
    speech.setAttribute('aria-pressed', String(speechOn && !!voice))
    if (previousVoice !== voice?.voiceURI) speakCue()
  }

  function updatePlayback() {
    const paused = runningSince === null
    playback.innerHTML = icon(paused ? 'play' : 'pause') + (paused ? 'Fortsæt' : 'Pause')
    playback.setAttribute('aria-label', paused ? 'Fortsæt øvelsen' : 'Sæt øvelsen på pause')
    dialog.classList.toggle('coach-paused', paused)
  }

  function record(completed: boolean, seconds: number) {
    const actual = Math.floor(seconds)
    if (actual > 0) saveSession({
      exerciseId, startedAt, finishedAt: new Date().toISOString(), seconds: actual, completed,
    })
  }

  function finish() {
    if (finished || closed) return
    finished = true
    runningSince = null
    accumulated = targetSeconds
    window.clearInterval(tick)
    record(true, targetSeconds)
    stopSpeaking()
    void playNote(523.25)
    orbit.style.setProperty('--coach-expansion', '0.5')
    cueTitle.textContent = 'Din øvelse er færdig'
    cueText.textContent = 'Tag et øjeblik, før du går videre. Tak for pausen.'
    sessionControls.hidden = true
    done.hidden = false
    close.setAttribute('aria-label', 'Luk afspilleren')
    close.title = 'Luk'
    done.focus({ preventScroll: true })
  }

  function render() {
    if (closed || finished) return
    const time = elapsed()
    if (time >= targetSeconds) { finish(); return }
    const second = Math.floor(time)
    if (second !== lastSecond) {
      lastSecond = second
      timer.textContent = clock(second)
    }
    progress.value = time
    if (runningSince === null) return
    const cue = currentCue(exercise!, time, targetSeconds)
    orbit.style.setProperty('--coach-expansion', cue.expansion.toFixed(4))
    if (cue.index !== lastCue) {
      lastCue = cue.index
      cueTitle.textContent = cue.title
      cueText.textContent = cue.instruction
      speakCue()
      void playNote(cue.index % 2 === 0 ? 392 : 329.63)
    }
  }

  function dismiss() {
    if (closed) return
    closed = true
    const time = elapsed()
    window.clearInterval(tick)
    window.removeEventListener('pagehide', dismiss)
    document.removeEventListener('visibilitychange', render)
    synthesis?.removeEventListener('voiceschanged', refreshVoices)
    stopSpeaking()
    if (audio) void audio.close().catch(() => {})
    if (dialog.open) dialog.close()
    dialog.remove()
    activePlayer = null
    if (!finished) record(time >= targetSeconds, time)
  }

  playback.addEventListener('click', () => {
    if (runningSince === null) {
      runningSince = performance.now()
      lastCue = -1
    } else {
      accumulated = elapsed()
      runningSince = null
      stopSpeaking()
      if (audio?.state === 'running') void audio.suspend().catch(() => {})
      cueTitle.textContent = 'På pause'
      cueText.textContent = 'Fortsæt, når du har lyst.'
    }
    updatePlayback()
    render()
  })
  sound.addEventListener('click', () => {
    soundOn = !soundOn
    setPreference(soundKey, soundOn)
    updateSound()
    if (soundOn) void playNote(392)
    else if (audio?.state === 'running') void audio.suspend().catch(() => {})
  })
  speech.addEventListener('click', () => {
    speechOn = !speechOn
    setPreference(speechKey, speechOn)
    speech.setAttribute('aria-pressed', String(speechOn))
    speech.removeAttribute('title')
    speakCue()
  })
  duration.addEventListener('change', () => {
    targetSeconds = Number(duration.value) * 60
    progress.max = targetSeconds
    total.textContent = clock(targetSeconds)
    render()
  })
  close.addEventListener('click', dismiss)
  done.addEventListener('click', dismiss)
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss() })
  dialog.addEventListener('close', dismiss)
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return
    const bounds = dialog.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dismiss()
  })
  window.addEventListener('pagehide', dismiss, { once: true })
  document.addEventListener('visibilitychange', render)
  synthesis?.addEventListener('voiceschanged', refreshVoices)
  refreshVoices()
  progress.max = targetSeconds
  total.textContent = clock(targetSeconds)
  updatePlayback()
  updateSound()
  document.body.appendChild(dialog)
  dialog.showModal()
  playback.focus({ preventScroll: true })
  render()
  tick = window.setInterval(render, 120)
}
