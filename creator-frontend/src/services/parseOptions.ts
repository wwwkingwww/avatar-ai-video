export interface ParsedMessage {
  content: string
  options: string[]
  optionMode: 'single' | 'multi'
}

export function stripOptions(text: string): string {
  return text.replace(/\[OPTIONS:\s*[^\]]*\]/g, '').trim()
}

export function parseOptions(text: string): ParsedMessage {
  const match = text.match(/\[OPTIONS:(single|multi):(.+?)\]/)
  if (match) {
    return {
      content: text.replace(match[0], '').trim(),
      options: match[2].split(',').map(s => s.trim()).filter(Boolean),
      optionMode: match[1] as 'single' | 'multi',
    }
  }
  return { content: text, options: [], optionMode: 'single' }
}
