import { currentCue, exercises, saveSession } from './coach'
import { icon } from './icon'
import { openSoundLibrary } from './sound-library'
import { pebbleFigure } from './pebble'
import { playPebbleStep, playPebbleVoice, stopPebbleVoice } from './pebble-voice'
import './player.css'

const soundKey = 'aandehul.cue-sound.v1'
const speechKey = 'aandehul.cue-speech.v1'
const unsavedPreferences = new Map<string, boolean>()
let activePlayer: HTMLDialogElement | null = null

function clock(seconds: number): string {
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
}

function preference(key: string, defaultValue = false): boolean {
  const pending = unsavedPreferences.get(key)
  if (pending !== undefined) return pending
  try {
    const saved = localStorage.getItem(key)
    return saved === null ? defaultValue : saved === 'on'
  } catch { return defaultValue }
}

function setPreference(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? 'on' : 'off')
    unsavedPreferences.delete(key)
  } catch { unsavedPreferences.set(key, on) }
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

export function openPlayer(exerciseId: string, minutes?: number): void {
  const exercise = exercises.find(item => item.id === exerciseId)
  if (!exercise) return
  if (activePlayer) { activePlayer.focus(); return }
  const initialMinutes = minutes !== undefined && exercise.durations.includes(minutes) ? minutes : exercise.minutes

  const dialog = document.createElement('dialog')
  activePlayer = dialog
  dialog.className = 'coach-player'
  dialog.dataset.practice = exercise.breath ? 'breathing' : exercise.category === 'Meditation' ? 'meditation' : 'relaxation'
  dialog.setAttribute('aria-labelledby', 'coach-exercise-title')
  dialog.innerHTML = `
    <div class="coach-sheet">
      <div class="coach-topline">
        <span class="coach-category"></span>
        <button type="button" class="coach-speech" aria-pressed="false"><span class="coach-speech-icon" aria-hidden="true"></span>Pebbles stemme<span class="coach-speech-switch" aria-hidden="true"></span></button>
        <button type="button" class="coach-close" aria-label="Afslut og luk øvelsen" title="Afslut og luk">${icon('x')}</button>
      </div>
      <h2 id="coach-exercise-title"></h2>
      <div class="coach-orbit" aria-hidden="true">
        <div class="coach-orbit-rings"></div>
        <span class="coach-air coach-air-left">${icon('wind')}</span>
        <span class="coach-air coach-air-right">${icon('wind')}</span>
        <div class="coach-stone-scene">
          <div class="coach-ground-shadow"></div>
          <div class="coach-pebble">${pebbleFigure('rest')}</div>
        </div>
      </div>
      <div class="coach-pace" role="timer" aria-live="off">
        <span class="coach-pace-direction" aria-hidden="true">${icon(exercise.breath ? 'arrow-right' : 'leaf')}</span>
        <span class="coach-beats" aria-hidden="true"></span>
        <span class="coach-pace-label"></span>
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
        <button type="button" class="coach-ambient" aria-haspopup="dialog">${icon('headphones')} Lydmiljø</button>
      </div>
      <p class="coach-voice-status" role="status" hidden></p>
      <button type="button" class="coach-done" hidden>Tilbage til mit åndehul</button>
    </div>`

  const element = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!
  const orbit = element('.coach-orbit')
  const figure = element('.pebble-figure')
  const pace = element('.coach-pace')
  const paceLabel = element('.coach-pace-label')
  const beats = element('.coach-beats')
  const cueTitle = element('.coach-cue h3')
  const cueText = element('.coach-cue p')
  const sessionControls = element('.coach-session-controls')
  const playback = element<HTMLButtonElement>('.coach-playback')
  const close = element<HTMLButtonElement>('.coach-close')
  const done = element<HTMLButtonElement>('.coach-done')
  const sound = element<HTMLButtonElement>('.coach-sound')
  const speech = element<HTMLButtonElement>('.coach-speech')
  const voiceStatus = element('.coach-voice-status')
  const duration = element<HTMLSelectElement>('select')
  const timer = element('.coach-timer')
  const total = element('.coach-total')
  const progress = element<HTMLProgressElement>('.coach-progress')
  element('.coach-category').textContent = exercise.category
  element('#coach-exercise-title').textContent = exercise.title
  duration.replaceChildren(...exercise.durations.map(minutes => new Option(minutes + ' min', String(minutes))))
  duration.value = String(initialMinutes)

  const startedAt = new Date().toISOString()
  let targetSeconds = initialMinutes * 60
  let accumulated = 0
  let runningSince: number | null = performance.now()
  let lastCue = -1
  let lastSecond = -1
  let soundOn = preference(soundKey) && typeof AudioContext !== 'undefined'
  let audio: AudioContext | undefined
  let speechOn = preference(speechKey, true)
  let voiceRevision = 0
  let lastRemaining = -1
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
    voiceRevision++
    stopPebbleVoice()
    figure.classList.remove('is-talking')
  }

  async function speakCue(complete = false) {
    if (!speechOn || closed || (!complete && (runningSince === null || lastCue < 0))) return
    const revision = ++voiceRevision
    voiceStatus.hidden = true
    const played = await (complete ? playPebbleVoice('complete') : playPebbleStep(exerciseId, lastCue)).catch(() => false)
    if (!played && revision === voiceRevision && !closed) {
      voiceStatus.textContent = 'Stemmen kunne ikke starte. Du kan stadig følge teksten.'
      voiceStatus.hidden = false
    }
  }

  function reflectSpeech(event: Event) {
    const playing = (event as CustomEvent<boolean>).detail === true
    figure.classList.toggle('is-talking', playing && speechOn && !closed && (runningSince !== null || finished))
  }

  function showSpeechPreference() {
    element('.coach-speech-icon').innerHTML = icon(speechOn ? 'volume-2' : 'volume-x')
    speech.setAttribute('aria-pressed', String(speechOn))
    speech.title = speechOn ? 'Slå Pebbles stemme fra' : 'Slå Pebbles danske stemme til'
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
    dialog.classList.add('coach-finished')
    figure.dataset.pose = 'happy'
    orbit.style.setProperty('--coach-expansion', '0.2')
    orbit.style.setProperty('--pebble-breath', '0.2')
    orbit.style.setProperty('--coach-flow', '0')
    pace.hidden = true
    cueTitle.textContent = 'Din øvelse er færdig'
    cueText.textContent = 'Tak for stunden. Tag roen med dig.'
    void speakCue(true)
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
    const shape = cue.expansion.toFixed(4)
    orbit.style.setProperty('--coach-expansion', shape)
    orbit.style.setProperty('--pebble-breath', shape)
    const { phase } = cue
    if (phase) orbit.style.setProperty('--coach-flow', Math.sin(Math.PI * phase.fraction).toFixed(4))
    if (cue.index !== lastCue) {
      lastCue = cue.index
      cueTitle.textContent = cue.title
      cueText.textContent = cue.instruction
      figure.dataset.pose = phase?.direction ?? cue.pose ?? (exercise!.category === 'Meditation' ? 'listening' : 'rest')
      if (phase) {
        dialog.dataset.phase = phase.direction
        pace.setAttribute('aria-label', phase.direction === 'inhale' ? 'Tid tilbage af indåndingen' : 'Tid tilbage af udåndingen')
        if (beats.childElementCount !== phase.seconds) {
          beats.replaceChildren(...Array.from({ length: phase.seconds }, () => document.createElement('i')))
        }
        lastRemaining = -1
      } else {
        paceLabel.textContent = 'Trin ' + (cue.index + 1) + ' af ' + exercise!.steps.length
      }
      void speakCue()
      void playNote(cue.index % 2 === 0 ? 392 : 329.63)
    }
    if (phase && phase.remaining !== lastRemaining) {
      lastRemaining = phase.remaining
      paceLabel.textContent = phase.remaining + ' sek.'
      for (const [index, beat] of Array.from(beats.children).entries()) {
        beat.classList.toggle('remaining', index < phase.remaining)
      }
    }
  }

  function dismiss() {
    if (closed) return
    closed = true
    const time = elapsed()
    window.clearInterval(tick)
    window.removeEventListener('pagehide', dismiss)
    window.removeEventListener('aandehul:studio-hidden', dismiss)
    document.removeEventListener('visibilitychange', render)
    window.removeEventListener('aandehul:pebble-speaking', reflectSpeech)
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
      tick = window.setInterval(render, 100)
    } else {
      render()
      if (finished) return
      accumulated = elapsed()
      runningSince = null
      window.clearInterval(tick)
      stopSpeaking()
      if (audio?.state === 'running') void audio.suspend().catch(() => {})
      figure.dataset.pose = 'paused'
      cueTitle.textContent = 'På pause'
      cueText.textContent = 'Jeg venter lige her. Fortsæt, når du har lyst.'
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
  element<HTMLButtonElement>('.coach-ambient').addEventListener('click', () => {
    openSoundLibrary(() => {
      if (finished && dialog.open) done.focus({ preventScroll: true })
    })
  })
  speech.addEventListener('click', () => {
    speechOn = !speechOn
    setPreference(speechKey, speechOn)
    showSpeechPreference()
    if (speechOn) void speakCue(finished)
    else {
      stopSpeaking()
      voiceStatus.hidden = true
    }
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
  window.addEventListener('aandehul:studio-hidden', dismiss)
  document.addEventListener('visibilitychange', render)
  stopPebbleVoice()
  window.addEventListener('aandehul:pebble-speaking', reflectSpeech)
  showSpeechPreference()
  progress.max = targetSeconds
  total.textContent = clock(targetSeconds)
  updatePlayback()
  updateSound()
  document.body.appendChild(dialog)
  dialog.showModal()
  playback.focus({ preventScroll: true })
  render()
  tick = window.setInterval(render, 100)
}
