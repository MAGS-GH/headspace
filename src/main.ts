import './style.css'
import { exercises, getHistory, isFavorite, toggleFavorite, type Exercise } from './coach'
import { openPlayer } from './player'
import { ambientState, environments, setCompanionSpeaking, setEnvironment } from './ambient'
import { openSoundLibrary } from './sound-library'
import { icon } from './icon'
import { pebbleFigure } from './pebble'
import { playPebbleVoice, stopPebbleVoice } from './pebble-voice'

const navItems = [
  { id: 'pusterum', label: 'Mit pusterum', icon: 'house' },
  { id: 'bibliotek', label: 'Øvelsesbibliotek', icon: 'book-open' },
  { id: 'favoritter', label: 'Mine favoritter', icon: 'heart' },
  { id: 'historik', label: 'Min historik', icon: 'history' },
] as const
type Page = typeof navItems[number]['id'] | 'pebble' | 'indstillinger'
const pageTitles: Record<Page, string> = { pusterum: 'Mit pusterum', bibliotek: 'Øvelsesbibliotek', favoritter: 'Mine favoritter', historik: 'Min historik', pebble: 'Min skrivebordsven', indstillinger: 'Indstillinger' }
const artwork: Record<string, string> = { 'rolig-vejrtraekning': 'breath', kropsscanning: 'body', 'giv-slip-paa-dagen': 'evening', 'et-roligt-oejeblik': 'pond', 'blid-udanding': 'reeds', 'lette-skuldre': 'hills' }
const categoryIcon: Record<string, string> = { 'Vejrtrækning': 'wind', 'Afspænding': 'flower-2', 'Meditation': 'moon-star' }
const moods = [
  { id: 'urolig', title: 'Urolig', icon: 'frown', reply: 'Jeg bliver lige her. Vi kan tage ét åndedrag ad gangen.' },
  { id: 'traet', title: 'Træt', icon: 'cloud-moon', reply: 'Du må gerne hvile lidt. Jeg holder dig med selskab.' },
  { id: 'tilpas', title: 'Tilpas', icon: 'smile', reply: 'Hvor rart. Skal vi bare blive her et øjeblik?' },
  { id: 'glad', title: 'Glad', icon: 'sun', reply: 'Nu smiler jeg også. Lad os nyde det et øjeblik.' },
]
const dateFormat = new Intl.DateTimeFormat('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })
const timeFormat = new Intl.DateTimeFormat('da-DK', { hour: '2-digit', minute: '2-digit' })
function displayDate(date: Date) {
  const str = dateFormat.format(date)
  return str.charAt(0).toUpperCase() + str.slice(1)
}
const dateKey = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
const sessionValues = new Map<string, string>()
function read(key: string): string | null {
  if (sessionValues.has(key)) return sessionValues.get(key)!
  try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value); sessionValues.delete(key) }
  catch { sessionValues.set(key, value) }
}
function checkins(): Record<string, string> {
  try {
    const stored = JSON.parse(read('aandehul.checkins.v1') || '{}')
    return Object.fromEntries(Object.entries(stored).filter(([key, value]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && moods.some(m => m.id === value))) as Record<string, string>
  } catch { return {} }
}

interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
type DesktopBridge = {
  postMessage(command: string): void
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
}
const bridge = (window as Window & { chrome?: { webview?: DesktopBridge } }).chrome?.webview
let installPrompt: InstallPrompt | null = null
let installed = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
let filter = 'Alle'
let page: Page = getPage()
let lastDate = dateKey(new Date())
document.documentElement.classList.add('js')
const root = document.querySelector<HTMLElement>('#app')!
const activeMood = () => checkins()[dateKey(new Date())]
document.documentElement.classList.toggle('less-motion', read('aandehul.less-motion') === 'on')

function getPage(): Page {
  const requested = location.hash.slice(1)
  return Object.hasOwn(pageTitles, requested) ? requested as Page : 'pusterum'
}
const pebbleImage = (cls = '') => `<img src="/images/pebble.png" class="${cls}" alt="" draggable="false">`
const wordmark = () => `<a href="#pusterum" class="brand" aria-label="Åndehul, til forsiden">${pebbleImage('brand-mark')}<span>Åndehul</span></a>`
const greetings = [
  { clip: 'greeting', words: 'Hej med dig. Skal vi tage en lille pause sammen?' },
  { clip: 'little-stone', words: 'Selv en sten som mig kan godt lide en lille pause.' },
  { clip: 'welcome', words: 'Lad skuldrene hvile. Vi tager det i dit tempo.' },
] as const
let nextGreeting = 0
let greetingButton: HTMLButtonElement | null = null
let greetingSettle: number | undefined

function greetingFigure(variant: 'meadow' | 'portrait') {
  return `<button type="button" data-action="greet" class="pebble-greeting ${variant}-friend" aria-label="Hør en hilsen fra Pebble">
    <span class="greet-bubble">${icon('volume-2')}<span>Hils på mig</span></span>
    <span class="friend-shadow"></span><span class="friend-body">${pebbleFigure('awake')}</span>
  </button>`
}
function navLink(id: Page, label: string, glyph: string) {
  return `<a class="nav-link" href="#${id}" data-nav="${id}">${icon(glyph)}<span>${label}</span></a>`
}
root.innerHTML = `
  <a class="skip" href="#content">Gå til indhold</a>
  <header class="mobile-bar">${wordmark()}<button class="circle-button" data-action="menu" aria-label="Åbn menu" aria-expanded="false" aria-controls="sidebar">${icon('menu')}</button></header>
  <button class="shade" aria-label="Luk menu" tabindex="-1" data-action="close-menu" hidden></button>
  <aside class="sidebar" id="sidebar" aria-label="Hovedmenu">
    <div class="sidebar-brand">${wordmark()}<button data-action="close-menu" aria-label="Luk menu" class="menu-close circle-button">${icon('x')}</button></div>
    <nav class="main-nav" aria-label="Sider">${navItems.map(item => navLink(item.id, item.label, item.icon)).join('')}</nav>
    <div class="sidebar-foot">
      <a href="#pebble" class="friend-card" data-nav="pebble">
        <div class="pet-habitat">${pebbleImage()}</div>
        <span class="friend-title">Din skrivebordsven</span>
        <span class="friend-link">Mød Pebble ${icon('arrow-right')}</span>
      </a>
      ${navLink('indstillinger', 'Indstillinger', 'settings')}
    </div>
  </aside>
  <main id="content" tabindex="-1">
    <div class="content-inner">
      <header class="page-header">
        <div><div class="date-line">${icon('sun')}<span id="today"></span></div><h1 id="page-title"></h1></div>
        <button class="sound-button" data-action="sound" aria-haspopup="dialog"></button>
      </header>
      <div id="view"></div>
    </div>
  </main>
  <dialog id="utility" aria-labelledby="utility-heading"></dialog>
  <div class="announcer" aria-live="polite" role="status"></div>`
const view = root.querySelector<HTMLElement>('#view')!
const utility = root.querySelector<HTMLDialogElement>('#utility')!
const announce = (msg: string) => { root.querySelector('.announcer')!.textContent = msg }

function exerciseCard(exercise: Exercise) {
  const liked = isFavorite(exercise.id)
  const tile = artwork[exercise.id]
  return `<article class="exercise-card cover-${tile}">
      <button class="exercise-open" data-start="${exercise.id}" aria-label="Start ${exercise.title}, ${exercise.minutes} minutter">
        <span class="cover"><img src="/images/${tile}.webp" alt="" loading="lazy"></span>
        <span class="card-copy">
          <span class="category">${icon(categoryIcon[exercise.category])}${exercise.category}</span>
          <span class="card-title">${exercise.title}</span>
          <span class="card-description">${exercise.description}</span>
          <span class="card-bottom"><span class="time">${icon('clock')}${exercise.minutes} min</span><span class="small-play">${icon('play')}</span></span>
        </span>
      </button>
      <button class="favorite ${liked ? 'is-saved' : ''}" data-favorite="${exercise.id}" aria-label="${liked ? 'Fjern' : 'Gem'} ${exercise.title} ${liked ? 'fra' : 'i'} favoritter" aria-pressed="${liked}">${icon('heart')}</button>
    </article>`
}
const grid = (items: Exercise[]) => `<div class="exercise-grid">${items.map(exerciseCard).join('')}</div>`
function home() {
  const current = activeMood()
  const reply = moods.find(m => m.id === current)?.reply
  return `<section class="hero" aria-labelledby="hero-title">
      <div class="hero-content">
        <span class="feature-label">${icon('sunrise')}Dagens pause</span>
        <h2 id="hero-title">Et øjebliks ro.</h2>
        <p data-greeting-line>Jeg hedder Pebble. Skal vi trække vejret sammen?</p>
        <div class="hero-actions"><button class="primary" data-start="rolig-vejrtraekning">${icon('play')}Start en pause</button><span class="time">${icon('clock')}3 min</span></div>
      </div>${greetingFigure('meadow')}
    </section>
    <section class="suggestions" aria-labelledby="suggested">
      <div class="section-title"><h2 id="suggested">Find din øvelse</h2><a href="#bibliotek" class="text-link">Se alle øvelser ${icon('arrow-right')}</a></div>
      ${grid(exercises.slice(0, 3))}
    </section>
    <section class="checkin" aria-labelledby="checkin-heading">
      <div class="checkin-intro"><span class="checkin-symbol">${icon('notebook-pen')}</span><div><h2 id="checkin-heading">Hvordan har du det?</h2><p>${reply ? 'Pebble siger “' + reply + '”' : 'Tag et øjeblik og mærk efter.'}</p></div></div>
      <div class="mood-options">${moods.map(m => `<button data-mood="${m.id}" aria-pressed="${current === m.id}" class="mood">${icon(m.icon)}${m.title}</button>`).join('')}</div>
    </section>`
}
function library() {
  return `<p class="page-description">Vælg en øvelse, der passer til dig lige nu.</p>
    <div class="filter-bar" role="group" aria-label="Filtrér øvelser">${['Alle', 'Vejrtrækning', 'Meditation', 'Afspænding'].map(f => `<button data-filter="${f}" aria-pressed="${filter === f}">${f}</button>`).join('')}</div>
    ${grid(exercises.filter(e => filter === 'Alle' || e.category === filter))}`
}
function emptyState(glyph: string, title: string, desc: string) {
  return `<div class="empty-state"><span class="empty-symbol">${icon(glyph)}</span><h2>${title}</h2><p>${desc}</p><a class="primary" href="#bibliotek">Udforsk øvelser ${icon('arrow-right')}</a></div>`
}
function favorites() {
  const saved = exercises.filter(e => isFavorite(e.id))
  return saved.length ? `<p class="page-description">Dine gemte øvelser, samlet ét sted.</p>${grid(saved)}` : emptyState('heart', 'Plads til dine favoritter', 'Tryk på hjertet ved en øvelse, du gerne vil vende tilbage til.')
}
function history() {
  const sessions = getHistory()
  const notes = checkins()
  const days = [...new Set([...sessions.map(s => dateKey(new Date(s.finishedAt))), ...Object.keys(notes)])].sort().reverse()
  if (!days.length) return emptyState('history', 'Her begynder din historik', 'Dine pauser og daglige indtjekninger dukker op her.')
  return `<p class="page-description">Et tilbageblik på de pauser, du har givet dig selv.</p>` + days.map(day => {
    const mood = moods.find(m => m.id === notes[day])
    return `<section class="history-day"><h2>${displayDate(new Date(day + 'T12:00:00'))}</h2>
      ${mood ? `<div class="history-row"><span class="row-symbol">${icon(mood.icon)}</span><div><strong>${mood.title}</strong><small>Dagens indtjekning</small></div></div>` : ''}
      ${sessions.filter(s => dateKey(new Date(s.finishedAt)) === day).map(s => {
        const exercise = exercises.find(e => e.id === s.exerciseId)
        const min = Math.floor(s.seconds / 60), sec = s.seconds % 60
        const duration = min ? min + ' min' + (sec ? ' ' + sec + ' sek' : '') : sec + ' sek'
        return `<div class="history-row"><span class="row-symbol">${icon(categoryIcon[exercise?.category || 'Vejrtrækning'])}</span><div><strong>${exercise?.title || 'Vejrtrækning med Pebble'}</strong><small>${duration} · ${s.completed ? 'Gennemført' : 'Afsluttet undervejs'}</small></div><time>${timeFormat.format(new Date(s.finishedAt))}</time></div>`
      }).join('')}</section>`
  }).join('')
}
function companion() {
  return `<section class="companion-view"><div class="companion-art">${greetingFigure('portrait')}</div>
      <div><h2>Hej, jeg er Pebble.</h2><p data-greeting-line>Jeg er en lille sten med god tid. Når jeg løfter mig, trækker vi vejret ind. Når jeg synker ned, puster vi ud.</p>
      <button class="primary" data-start="rolig-vejrtraekning" data-minutes="1">${icon('wind')}Ét minut med mig</button>
      </div></section>
      <section class="detail-block"><h2>Pebble på skrivebordet</h2><p>På Windows kan Pebble sidde oven på dine andre vinduer. Klik på stenen for en pause, eller træk den hen, hvor den skal sidde.</p>
      ${bridge ? `<div class="desktop-actions"><button class="secondary" data-action="show-pebble">${icon('monitor')}Vis Pebble på skrivebordet</button><button class="secondary" data-action="start-breathing">${icon('wind')}Træk vejret med Pebble</button></div>` : `<a class="secondary" href="/downloads/Aandehul-Windows.zip" download>${icon('download')}Hent til Windows</a><p class="small-note">Pak ZIP-filen ud, og start Aandehul.exe. Til Windows 10 og 11 (x64) med <a href="https://dotnet.microsoft.com/download/dotnet/10.0" target="_blank" rel="noreferrer">.NET 10 Desktop Runtime</a> og Microsoft Edge WebView2.</p>`}
      </section>`
}
function settings() {
  const reduced = document.documentElement.classList.contains('less-motion')
  return `<section class="settings-list">
    <div class="settings-row"><span class="row-symbol">${icon('leaf')}</span><div><strong>Mindre bevægelse</strong><p>Gør animationerne i øvelserne mere stille.</p></div><button data-action="motion" role="switch" aria-checked="${reduced}" aria-label="Mindre bevægelse" class="switch"><span></span></button></div>
    <div class="settings-row"><span class="row-symbol">${icon('headphones')}</span><div><strong>Lydmiljø</strong><p>Vælg musik eller naturlyde til din pause.</p></div><button class="secondary" data-action="sound">Vælg lyd</button></div>
    ${bridge ? '' : `<div class="settings-row"><span class="row-symbol">${icon('download')}</span><div><strong>Installér Åndehul</strong><p>Åbn dit pusterum som app på denne enhed.</p></div>${installed ? '<span class="installed">Installeret</span>' : '<button class="secondary" data-action="install">Installér</button>'}</div>`}
    <div class="settings-row"><span class="row-symbol">${icon('monitor')}</span><div><strong>Lokalt på din enhed</strong><p>Dine favoritter, pauser og indtjekninger gemmes i denne app.</p></div></div>
  </section>`
}
function refreshSound() {
  const { selected } = ambientState()
  const playing = selected !== 'off'
  const button = root.querySelector<HTMLButtonElement>('.sound-button')!
  button.classList.toggle('playing', playing)
  const label = environments.find(s => s.id === selected)?.name ?? 'Lydmiljø'
  button.title = playing ? 'Lydmiljø · ' + label : label
  button.setAttribute('aria-label', playing ? 'Åbn lydmiljø. Spiller ' + label : 'Lydmiljø')
  button.innerHTML = icon(playing ? 'audio-lines' : 'volume-2') + '<span>' + label + '</span>'
}
window.addEventListener('aandehul:ambient-change', () => {
  refreshSound()
  bridge?.postMessage(ambientState().selected === 'off' ? 'ambient-stopped' : 'ambient-playing')
})
bridge?.addEventListener('message', event => {
  switch (event.data?.type) {
    case 'stop-ambient': void setEnvironment('off'); break
    case 'companion-speaking': setCompanionSpeaking(event.data.active === true); break
    case 'studio-hidden':
      endGreeting()
      window.dispatchEvent(new Event('aandehul:studio-hidden'))
      break
  }
})
function render() {
  endGreeting()
  document.title = pageTitles[page] + ' · Åndehul'
  root.querySelector('#page-title')!.textContent = pageTitles[page]
  root.querySelector('#today')!.textContent = displayDate(new Date())
  root.querySelectorAll<HTMLElement>('[data-nav]').forEach(el => {
    if (el.dataset.nav === page) el.setAttribute('aria-current', 'page')
    else el.removeAttribute('aria-current')
  })
  const layouts = { pusterum: home, bibliotek: library, favoritter: favorites, historik: history, pebble: companion, indstillinger: settings }
  view.innerHTML = layouts[page]()
  refreshSound()
}
function dialogContent(title: string, body: string) {
  utility.innerHTML = `<div class="dialog-head"><h2 id="utility-heading">${title}</h2><button data-action="close" class="circle-button" aria-label="Luk">${icon('x')}</button></div>${body}`
  if (!utility.open) utility.showModal()
}
function setMenu(open: boolean) {
  root.classList.toggle('menu-open', open)
  root.querySelector<HTMLElement>('main')!.inert = open
  root.querySelector<HTMLElement>('.mobile-bar')!.inert = open
  root.querySelector<HTMLElement>('.skip')!.inert = open
  const toggle = root.querySelector<HTMLButtonElement>('[data-action="menu"]')!
  toggle.setAttribute('aria-expanded', String(open))
  root.querySelector<HTMLButtonElement>('.shade')!.hidden = !open
  if (open) root.querySelector<HTMLButtonElement>('.menu-close')!.focus()
  else if (window.matchMedia('(max-width: 820px)').matches && root.querySelector('#sidebar')!.contains(document.activeElement)) toggle.focus()
}
function refocus(attribute: string, value: string) {
  view.querySelector<HTMLElement>(`[${attribute}="${CSS.escape(value)}"]`)?.focus({ preventScroll: true })
}

function settleGreeting(button: HTMLButtonElement) {
  button.querySelector('.pebble-figure')?.classList.remove('is-talking')
  const figure = button.querySelector<HTMLElement>('.pebble-figure')!
  figure.dataset.pose = 'happy'
  button.querySelector('.greet-bubble span')!.textContent = 'Hils igen'
  button.setAttribute('aria-label', 'Hør en ny hilsen fra Pebble')
  greetingSettle = window.setTimeout(() => { figure.dataset.pose = 'awake' }, 1400)
}
function endGreeting() {
  window.clearTimeout(greetingSettle)
  if (!greetingButton) return
  const previous = greetingButton
  greetingButton = null
  stopPebbleVoice()
  settleGreeting(previous)
}
async function greet(button: HTMLButtonElement) {
  if (greetingButton) { endGreeting(); return }
  window.clearTimeout(greetingSettle)
  const turn = nextGreeting++
  const greeting = greetings[turn % greetings.length]
  greetingButton = button
  view.querySelector('[data-greeting-line]')!.textContent = greeting.words
  button.querySelector<HTMLElement>('.pebble-figure')!.dataset.pose = 'listening'
  button.querySelector('.greet-bubble span')!.textContent = 'Stop hilsen'
  button.setAttribute('aria-label', 'Stop Pebbles hilsen')
  if (!(await playPebbleVoice(greeting.clip)) && greetingButton === button && nextGreeting === turn + 1) {
    endGreeting()
    announce(greeting.words)
  }
}
window.addEventListener('aandehul:pebble-speaking', event => {
  if (!greetingButton) return
  greetingButton.querySelector('.pebble-figure')!.classList.toggle('is-talking', (event as CustomEvent<boolean>).detail)
})
window.addEventListener('aandehul:pebble-voice-ended', () => {
  if (!greetingButton) return
  settleGreeting(greetingButton)
  greetingButton = null
})
root.addEventListener('click', async event => {
  const target = (event.target as Element).closest<HTMLElement>('button,a')
  if (!target) return
  const { action, start, favorite, mood, filter: choice } = target.dataset
  if (start) { endGreeting(); openPlayer(start, target.dataset.minutes ? Number(target.dataset.minutes) : undefined); return }
  if (favorite) {
    const favorites = [...view.querySelectorAll<HTMLElement>('[data-favorite]')]
    const index = favorites.indexOf(target)
    const saved = toggleFavorite(favorite)
    if (page === 'favoritter' && !saved) {
      const remaining = [...view.querySelectorAll<HTMLElement>('[data-favorite]')]
      const next = remaining[Math.min(index, remaining.length - 1)] ?? view.querySelector<HTMLElement>('.empty-state a')
      next?.focus({ preventScroll: true })
    }
    announce(saved ? 'Gemt i dine favoritter.' : 'Fjernet fra dine favoritter.')
    return
  }
  if (mood && moods.some(m => m.id === mood)) {
    const entries = checkins()
    entries[dateKey(new Date())] = mood
    write('aandehul.checkins.v1', JSON.stringify(entries))
    render(); refocus('data-mood', mood); announce('Din indtjekning er gemt.'); return
  }
  if (choice) { filter = choice; render(); refocus('data-filter', choice); return }
  if (target.classList.contains('skip')) { event.preventDefault(); root.querySelector<HTMLElement>('#content')!.focus(); return }
  if (target.matches('[data-nav],.brand')) setMenu(false)
  switch (action) {
    case 'greet': await greet(target as HTMLButtonElement); break
    case 'menu': setMenu(true); break
    case 'close-menu': setMenu(false); break
    case 'close': utility.close(); break
    case 'sound': openSoundLibrary(); break
    case 'show-pebble': case 'start-breathing': bridge?.postMessage(action); break
    case 'motion': {
      const reduced = document.documentElement.classList.toggle('less-motion')
      write('aandehul.less-motion', reduced ? 'on' : 'off')
      target.setAttribute('aria-checked', String(reduced))
      break
    }
    case 'install':
      if (installPrompt) {
        const prompt = installPrompt
        installPrompt = null
        await prompt.prompt()
        if ((await prompt.userChoice).outcome === 'accepted') { installed = true; render() }
      } else {
        const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
        dialogContent('Installér Åndehul', apple
          ? '<p>Åbn Åndehul i Safari. Tryk på Del og vælg Føj til hjemmeskærm. Åbn derefter Åndehul fra det nye ikon.</p>'
          : '<p>Åbn browserens menu og vælg Installér app eller Føj til startskærm, hvis muligheden vises. På en computer kan du åbne Åndehul i Chrome eller Edge for at installere den.</p>')
      }
      break
  }
})
utility.addEventListener('click', event => {
  if (event.target !== utility) return
  const r = utility.getBoundingClientRect()
  if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) utility.close()
})
window.addEventListener('hashchange', () => {
  page = getPage(); setMenu(false); render(); window.scrollTo(0, 0)
  root.querySelector<HTMLElement>('#content')!.focus({ preventScroll: true })
})
window.addEventListener('keydown', event => {
  if (!root.classList.contains('menu-open')) return
  if (event.key === 'Escape') setMenu(false)
  if (event.key === 'Tab') {
    const links = [...root.querySelectorAll<HTMLElement>('#sidebar a,#sidebar button')].filter(el => el.offsetParent !== null)
    if (event.shiftKey && document.activeElement === links[0]) { event.preventDefault(); links.at(-1)?.focus() }
    else if (!event.shiftKey && document.activeElement === links.at(-1)) { event.preventDefault(); links[0]?.focus() }
  }
})
window.matchMedia('(max-width: 820px)').addEventListener('change', () => setMenu(false))
window.addEventListener('aandehul:change', () => {
  if (page === 'historik') { render(); return }
  const buttons = [...view.querySelectorAll<HTMLButtonElement>('[data-favorite]')]
  if (page === 'favoritter' && (buttons.length !== exercises.filter(e => isFavorite(e.id)).length || buttons.some(b => !isFavorite(b.dataset.favorite!)))) {
    render()
    return
  }
  for (const button of buttons) {
    const item = exercises.find(e => e.id === button.dataset.favorite)
    if (!item) continue
    const saved = isFavorite(item.id)
    button.classList.toggle('is-saved', saved)
    button.setAttribute('aria-pressed', String(saved))
    button.setAttribute('aria-label', saved ? 'Fjern ' + item.title + ' fra favoritter' : 'Gem ' + item.title + ' i favoritter')
  }
})
window.addEventListener('storage', event => {
  if (event.key === null) sessionValues.clear()
  else sessionValues.delete(event.key)
  if (event.key === null || event.key === 'aandehul.less-motion') {
    document.documentElement.classList.toggle('less-motion', read('aandehul.less-motion') === 'on')
    if (page === 'indstillinger') render()
  }
  if ((event.key === null || event.key === 'aandehul.checkins.v1') && (page === 'historik' || page === 'pusterum')) render()
})
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event as InstallPrompt })
window.addEventListener('appinstalled', () => { installed = true; installPrompt = null; if (page === 'indstillinger') render() })
function refreshDate() {
  const today = dateKey(new Date())
  if (lastDate !== today) { lastDate = today; render() }
}
window.addEventListener('focus', refreshDate)
window.setInterval(refreshDate, 60000)
render()
