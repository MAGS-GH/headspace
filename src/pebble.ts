import './pebble.css'

type PebblePose = 'rest' | 'awake' | 'inhale' | 'exhale' | 'happy' | 'paused' | 'listening'

const layers = ['body', 'sprout', 'eyes-rest', 'eyes-open', 'eyes-happy', 'mouth-smile', 'mouth-round', 'mouth-talk']

/** Each layer uses the same registration points, including in the Windows companion. */
export function pebbleFigure(pose: PebblePose = 'rest'): string {
  const parts = layers.map(name => `<img class="pebble-part part-${name}" src="${import.meta.env.BASE_URL}images/pebble-parts/${name}.png" alt="" draggable="false">`)
  return `<span class="pebble-figure" data-pose="${pose}" aria-hidden="true">${parts.join('')}</span>`
}
