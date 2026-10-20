import { expect, test } from 'claude-code/testing'

import { toLang } from '../hooks/i18n'

test('language names and locales map to a panel language', () => {
  expect(toLang('繁體中文')).toBe('zh-TW')
  expect(toLang('Traditional Chinese')).toBe('zh-TW')
  expect(toLang('zh_TW.UTF-8')).toBe('zh-TW')
  expect(toLang('japanese')).toBe('ja')
  expect(toLang('ja_JP.UTF-8')).toBe('ja')
  expect(toLang('en_US.UTF-8')).toBe('en')
  expect(toLang('auto')).toBeUndefined()
  expect(toLang('C')).toBeUndefined()
})
