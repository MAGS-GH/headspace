import type { Recording } from './recording'

const sourceUrl = 'https://opengameart.org/content/park-ambiences'
const licenseUrl = 'https://creativecommons.org/publicdomain/zero/1.0/'

export const natureTracks = [
  {
    id: 'nature-stream',
    name: 'Vandløbet',
    artist: 'Thimras',
    title: 'Park ambiences – park_ambience_river.wav',
    description: 'Vand risler over et lavt fald.',
    src: '/soundscapes/nature-stream.mp3',
    duration: 90,
    sourceUrl,
    license: 'CC0 1.0',
    licenseUrl,
    changes: 'Udsnit fra 0:42 til 2:18. Seks sekunders overlap, let filtrering og justeret lydstyrke. Stereo-MP3.',
  },
  {
    id: 'nature-birds',
    name: 'Fugle før regnen',
    artist: 'Thimras',
    title: 'Park ambiences – park_ambience_birds.wav',
    description: 'Fuglekald mellem træerne før regnen.',
    src: '/soundscapes/nature-birds.mp3',
    duration: 90,
    sourceUrl,
    license: 'CC0 1.0',
    licenseUrl,
    changes: 'Udsnit fra 0:21 til 1:57. Seks sekunders overlap, let filtrering og justeret lydstyrke. Stereo-MP3.',
  },
] satisfies Recording[]
