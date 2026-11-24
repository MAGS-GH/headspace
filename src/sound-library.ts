import { ambientState, environments, setEnvironment, setLevel, type Environment, type SoundGroup } from './ambient'
import { icon } from './icon'
import './sound-library.css'

const covers: Record<string, string> = {
  'music-afternoon-lullaby': 'meadow',
  'music-gymnopedie': 'body',
  'music-vaporware': 'evening',
  'nature-stream': 'pond',
  'nature-birds': 'breath',
}

const dialog = document.createElement('dialog')
dialog.className = 'sound-library'
dialog.setAttribute('aria-labelledby', 'sound-library-title')
let group: SoundGroup = 'music'

function duration(seconds: number) {
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0')
}

function trackButton(sound: Environment) {
  const recording = sound.recording
  const thumbnail = recording
    ? `<img class="track-cover" src="/images/${covers[sound.id]}.webp" alt="">`
    : `<span class="noise-symbol">${icon(sound.icon)}</span>`
  return `<button type="button" class="track-choice" data-audio="${sound.id}" aria-pressed="false">
    ${thumbnail}<span class="track-info"><strong>${sound.name}</strong>${recording ? `<small>${recording.description}</small>` : ''}</span>
    ${recording ? `<span class="track-time">${duration(recording.duration)}</span>` : ''}<span class="track-control">${icon('play')}</span>
  </button>`
}

function refreshStatus(failed = false) {
  if (!dialog.open) return
  const { selected } = ambientState()
  const current = environments.find(sound => sound.id === selected)
  for (const button of dialog.querySelectorAll<HTMLButtonElement>('.track-choice')) {
    const on = button.dataset.audio === selected
    button.setAttribute('aria-pressed', String(on))
    button.setAttribute('aria-label', (on ? 'Stop ' : 'Afspil ') + button.querySelector('strong')!.textContent)
    button.querySelector('.track-control')!.innerHTML = icon(on ? 'audio-lines' : 'play')
  }
  dialog.querySelector<HTMLButtonElement>('[data-audio="off"]')!.disabled = !current
  dialog.querySelector('[data-now-playing]')!.textContent = failed
    ? 'Lyden kunne ikke starte. Vælg et spor for at prøve igen.'
    : current ? current.name + ' spiller i løkke' : 'Stilhed'
}

function renderGroup() {
  for (const tab of dialog.querySelectorAll<HTMLButtonElement>('[data-group]')) {
    tab.setAttribute('aria-pressed', String(tab.dataset.group === group))
  }
  const list = environments.filter(sound => sound.group === group)
  const tracks = list.filter(sound => sound.recording)
  const textures = list.filter(sound => sound.noise)
  dialog.querySelector('.track-list')!.innerHTML = tracks.map(trackButton).join('') + (textures.length
    ? `<h3>Bløde lydflader</h3><div class="noise-choices">${textures.map(trackButton).join('')}</div>` : '')
  dialog.querySelector<HTMLElement>('.original-music')!.hidden = group !== 'music'
  refreshStatus()
}

export function openSoundLibrary(afterClose?: () => void) {
  if (dialog.open) return
  const { selected, level } = ambientState()
  group = environments.find(sound => sound.id === selected)?.group ?? 'music'
  const credits = environments.flatMap(({ recording }) => recording ? [recording] : []).map(r =>
    `<li><strong>${r.title}</strong><span>${r.artist}</span><small>${r.changes}</small><div><a href="${r.sourceUrl}" target="_blank" rel="noopener noreferrer">Originalkilde</a><a href="${r.licenseUrl}" target="_blank" rel="noopener noreferrer">${r.license}</a></div></li>`).join('')
  dialog.innerHTML = `
    <div class="sound-heading"><h2 id="sound-library-title">Lydmiljø</h2><button type="button" data-close class="circle-button" aria-label="Luk lydmiljø">${icon('x')}</button></div>
    <div class="sound-tabs" role="group" aria-label="Vælg lydtype">
      <button type="button" data-group="music">${icon('headphones')}Musik</button>
      <button type="button" data-group="nature">${icon('leaf')}Naturlyde</button>
    </div>
    <div class="track-list"></div>
    <a class="original-music" href="https://c418.bandcamp.com/track/sweden" target="_blank" rel="noopener noreferrer">Hør <i>Sweden</i> fra Minecraft på Bandcamp ${icon('arrow-right')}</a>
    <div class="sound-mix">
      <div class="playing-line"><span role="status" aria-live="polite" data-now-playing></span><button type="button" data-audio="off">Stop lyd</button></div>
      <label class="volume-line" for="ambient-volume">${icon('volume-2')}Lydstyrke <output for="ambient-volume">${Math.round(level * 100)} %</output></label>
      <input id="ambient-volume" type="range" min="0" max="100" value="${Math.round(level * 100)}">
    </div>
    <details class="sound-credits"><summary>Kunstnere og licenser</summary><ul>${credits}</ul></details>`
  document.body.appendChild(dialog)
  if (afterClose) dialog.addEventListener('close', afterClose, { once: true })
  dialog.showModal()
  renderGroup()
}

dialog.addEventListener('click', event => {
  const target = (event.target as Element).closest<HTMLElement>('button,a')
  if (target?.hasAttribute('data-close')) { dialog.close(); return }
  if (target?.dataset.group) { group = target.dataset.group as SoundGroup; renderGroup(); return }
  if (target?.dataset.audio) {
    const id = target.dataset.audio
    void setEnvironment(id === ambientState().selected ? 'off' : id)
    return
  }
  if (target?.classList.contains('original-music')) void setEnvironment('off')
  if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect()
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close()
  }
})
dialog.addEventListener('input', event => {
  const slider = event.target as HTMLInputElement
  if (slider.id !== 'ambient-volume') return
  setLevel(slider.valueAsNumber / 100)
  dialog.querySelector('output')!.value = slider.value + ' %'
})
window.addEventListener('aandehul:ambient-change', event => refreshStatus((event as CustomEvent).detail?.error))
