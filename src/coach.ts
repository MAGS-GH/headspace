export type ExerciseCategory = 'Vejrtrækning' | 'Meditation' | 'Afspænding'

interface GuideStep {
  title: string
  instruction: string
  pose?: 'rest' | 'listening' | 'awake' | 'happy'
}

interface BreathPattern {
  inhale: number
  exhale: number
}

export interface Exercise {
  id: string
  title: string
  description: string
  category: ExerciseCategory
  minutes: number
  durations: number[]
  steps: GuideStep[]
  breath?: BreathPattern
}

export const exercises: Exercise[] = [
  {
    id: 'rolig-vejrtraekning',
    title: 'Rolig vejrtrækning',
    description: 'Følg en blid rytme, ét åndedrag ad gangen.',
    category: 'Vejrtrækning',
    minutes: 3,
    durations: [1, 3, 5],
    breath: { inhale: 4, exhale: 4 },
    steps: [
      { title: 'Træk vejret ind', instruction: 'Lad luften komme stille ind i dit eget tempo.' },
      { title: 'Pust langsomt ud', instruction: 'Lad skuldrene hvile, mens luften slipper ud.' },
    ],
  },
  {
    id: 'kropsscanning',
    title: 'Kropsscanning',
    description: 'Lad opmærksomheden gå på besøg i kroppen.',
    category: 'Afspænding',
    minutes: 5,
    durations: [3, 5, 10],
    steps: [
      { title: 'Find dig til rette', instruction: 'Mærk fladen under dig. Lad hænderne hvile, hvor de har lyst.' },
      { title: 'Mærk dine fødder', instruction: 'Læg mærke til tæerne, hælene og kontakten med gulvet.' },
      { title: 'Giv benene plads', instruction: 'Flyt opmærksomheden langsomt fra anklerne op mod hofterne.' },
      { title: 'Hvil i midten', instruction: 'Læg mærke til den lille bevægelse i maven, når du trækker vejret.' },
      { title: 'Mærk dine skuldre', instruction: 'Følg armene helt ud til fingerspidserne. Måske føles én hånd varmere.' },
      { title: 'Vend stille tilbage', instruction: 'Mærk kroppen som en helhed. Bevæg forsigtigt fingre og tæer.', pose: 'awake' },
    ],
  },
  {
    id: 'giv-slip-paa-dagen',
    title: 'Giv slip på dagen',
    description: 'En stille meditation til dagens sidste stund.',
    category: 'Meditation',
    minutes: 7,
    durations: [3, 7, 10],
    steps: [
      { title: 'Land her', instruction: 'Lad blikket hvile på et roligt punkt, eller luk øjnene et øjeblik.' },
      { title: 'Lad dagen passere', instruction: 'Måske dukker et øjeblik fra dagen op. Lad det ligge et øjeblik.', pose: 'rest' },
      { title: 'Mærk et åndedrag', instruction: 'Følg luften ind og ud. Du må gerne vende tilbage til åndedrættet mange gange.', pose: 'rest' },
      { title: 'Find én lille ting', instruction: 'Tænk på en lille ting fra i dag, som var rar. Bliv lidt ved den.', pose: 'happy' },
      { title: 'Tag roen med', instruction: 'Mærk rummet omkring dig, og kom langsomt tilbage i dit eget tempo.', pose: 'awake' },
    ],
  },
  {
    id: 'et-roligt-oejeblik',
    title: 'Et roligt øjeblik',
    description: 'Find et lille holdepunkt i lydene omkring dig.',
    category: 'Meditation',
    minutes: 3,
    durations: [1, 3, 5],
    steps: [
      { title: 'Sæt dig godt', instruction: 'Find en behagelig stilling. Mærk dine fødder mod underlaget.' },
      { title: 'Lyt til rummet', instruction: 'Læg mærke til en lyd i nærheden. Lad den komme og gå.' },
      { title: 'Lyt lidt længere væk', instruction: 'Måske kan du høre noget udenfor. Vend roligt tilbage, når tankerne vandrer.' },
      { title: 'Vend tilbage', instruction: 'Lad blikket glide rundt i rummet. Giv dig tid til at komme videre.', pose: 'awake' },
    ],
  },
  {
    id: 'blid-udanding',
    title: 'Blid udånding',
    description: 'Giv udåndingen lidt ekstra tid og plads.',
    category: 'Vejrtrækning',
    minutes: 2,
    durations: [1, 2, 5],
    breath: { inhale: 3, exhale: 5 },
    steps: [
      { title: 'Træk vejret ind', instruction: 'Tag en let indånding i en rytme, som passer dig.' },
      { title: 'Lad luften slippe ud', instruction: 'Giv udåndingen lidt længere tid, så længe det føles rart.' },
    ],
  },
  {
    id: 'lette-skuldre',
    title: 'Lette skuldre',
    description: 'En lille afspænding ved skrivebordet.',
    category: 'Afspænding',
    minutes: 3,
    durations: [1, 3, 5],
    steps: [
      { title: 'Find en rar stilling', instruction: 'Lad fødderne hvile mod gulvet og armene ligge løst langs siden.' },
      { title: 'Mærk dine skuldre', instruction: 'Læg mærke til, hvordan skuldrene føles lige nu.' },
      { title: 'Løft ganske let', instruction: 'Hvis det føles rart, så løft langsomt skuldrene en smule og lad dem synke igen.' },
      { title: 'Lad armene hvile', instruction: 'Mærk vægten i hænderne. Giv kæben lidt plads.' },
      { title: 'Find tilbage', instruction: 'Bevæg forsigtigt fingrene og lad blikket vende tilbage til rummet.', pose: 'awake' },
    ],
  },
]

export interface SessionRecord {
  exerciseId: string
  startedAt: string
  finishedAt: string
  seconds: number
  completed: boolean
}

const historyPrefix = 'aandehul.session.v1.'
const favoritePrefix = 'aandehul.favorite.v1.'
const fallback = new Map<string, string>()

function read(key: string): string | null {
  if (fallback.has(key)) return fallback.get(key)!
  try { return localStorage.getItem(key) }
  catch { return null }
}

function write(key: string, value: string): boolean {
  let persisted = true
  try {
    localStorage.setItem(key, value)
    fallback.delete(key)
  } catch {
    fallback.set(key, value)
    persisted = false
  }
  window.dispatchEvent(new Event('aandehul:change'))
  return persisted
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key === null || event.key.startsWith(historyPrefix) || event.key.startsWith(favoritePrefix)) {
      if (event.key === null) fallback.clear()
      else fallback.delete(event.key)
      window.dispatchEvent(new Event('aandehul:change'))
    }
  })
}

export function isFavorite(id: string): boolean {
  return read(favoritePrefix + id) === 'true'
}

export function toggleFavorite(id: string): boolean {
  if (!exercises.some(exercise => exercise.id === id)) return false
  const selected = !isFavorite(id)
  write(favoritePrefix + id, String(selected))
  return selected
}

function isSession(value: unknown): value is SessionRecord {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<SessionRecord>
  return typeof row.exerciseId === 'string'
    && exercises.some(exercise => exercise.id === row.exerciseId)
    && typeof row.seconds === 'number' && Number.isFinite(row.seconds) && row.seconds > 0
    && typeof row.startedAt === 'string' && Number.isFinite(Date.parse(row.startedAt))
    && typeof row.finishedAt === 'string' && Number.isFinite(Date.parse(row.finishedAt))
    && typeof row.completed === 'boolean'
}

export function getHistory(): SessionRecord[] {
  const keys = new Set(fallback.keys())
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(historyPrefix)) keys.add(key)
    }
  } catch {
    // Restricted storage still allows history in the current window.
  }
  const records: SessionRecord[] = []
  for (const key of keys) {
    if (!key.startsWith(historyPrefix)) continue
    try {
      const record: unknown = JSON.parse(read(key) ?? 'null')
      if (isSession(record)) records.push(record)
    } catch {
      // Skip an unreadable entry while keeping the rest of the history.
    }
  }
  return records.sort((left, right) => Date.parse(right.finishedAt) - Date.parse(left.finishedAt))
}

export function saveSession(record: SessionRecord): boolean {
  if (!isSession(record)) return false
  // Individual records avoid lost updates between tabs, and make desktop retries idempotent.
  const key = historyPrefix + record.exerciseId + '.' + record.startedAt
  const value = JSON.stringify(record)
  if (!fallback.has(key) && read(key) === value) return true
  return write(key, value)
}

interface CompanionBridge {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
  postMessage(message: string): void
}

if (typeof window !== 'undefined') {
  const bridge = (window as Window & { chrome?: { webview?: CompanionBridge } }).chrome?.webview
  if (bridge) {
    bridge.addEventListener('message', event => {
      const message = event.data
      if (message?.type !== 'pebble-session' || !isSession(message.record)) return
      if (saveSession(message.record)) bridge.postMessage('pebble-saved:' + message.record.startedAt)
    })
    bridge.postMessage('pebble-ready')
  }
}

export interface CurrentCue extends GuideStep {
  index: number
  expansion: number
  phase?: {
    direction: 'inhale' | 'exhale'
    seconds: number
    remaining: number
    fraction: number
  }
}

export function currentCue(exercise: Exercise, elapsed: number, duration: number): CurrentCue {
  if (exercise.breath) {
    const { inhale, exhale } = exercise.breath
    const cycle = elapsed % (inhale + exhale)
    const breathingIn = cycle < inhale
    const phaseLength = breathingIn ? inhale : exhale
    const phaseTime = breathingIn ? cycle : cycle - inhale
    const fraction = phaseTime / phaseLength
    const curve = (1 - Math.cos(Math.PI * fraction)) / 2
    return {
      ...exercise.steps[breathingIn ? 0 : 1],
      index: breathingIn ? 0 : 1,
      expansion: breathingIn ? curve : 1 - curve,
      phase: {
        direction: breathingIn ? 'inhale' : 'exhale',
        seconds: phaseLength,
        remaining: Math.ceil(Math.min(phaseLength - phaseTime, duration - elapsed)),
        fraction,
      },
    }
  }
  const index = Math.min(exercise.steps.length - 1, Math.floor(elapsed / duration * exercise.steps.length))
  return { ...exercise.steps[index], index, expansion: (1 - Math.cos(elapsed / 5)) / 2 }
}
