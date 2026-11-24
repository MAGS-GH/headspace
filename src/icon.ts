const sources = import.meta.glob<string>('./icons/*.svg', { eager: true, query: '?raw', import: 'default' })

export function icon(name: string): string {
  const svg = sources['./icons/' + name + '.svg']
  return svg ? svg.replace('<svg', '<svg aria-hidden="true" focusable="false"') : ''
}
