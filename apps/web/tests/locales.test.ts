import { expect, it } from 'vitest'
import en from '../src/i18n/locales/en'
import de from '../src/i18n/locales/de'

function messages(value: object, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof entry === 'string' ? [[path, entry]] : Object.entries(messages(entry, path))
  }))
}

it('provides matching translation keys and interpolation placeholders in both languages', () => {
  const english = messages(en)
  const german = messages(de)
  expect(Object.keys(german).sort()).toEqual(Object.keys(english).sort())
  for (const [key, text] of Object.entries(english)) {
    expect(german[key].trim(), key).not.toBe('')
    expect((german[key].match(/\{[^}]+\}/g) ?? []).sort(), key)
      .toEqual((text.match(/\{[^}]+\}/g) ?? []).sort())
  }
})
