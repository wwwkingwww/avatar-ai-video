import { describe, it, expect, vi } from 'vitest'

vi.mock('../adb-bridge.js', () => ({
  tap: vi.fn().mockResolvedValue(true),
  swipe: vi.fn().mockResolvedValue(true),
  inputText: vi.fn().mockResolvedValue(true),
  launchApp: vi.fn().mockResolvedValue(true),
  screenshot: vi.fn().mockImplementation((name) => `/sdcard/screenshots/${name}.png`),
  keyEvent: vi.fn().mockReturnValue(true),
}))

import { resolveTemplate, executeActions } from '../action-engine.js'
import * as adb from '../adb-bridge.js'

describe('action-engine', () => {
  describe('resolveTemplate', () => {
    it('replaces {{key}} with value from params', () => {
      expect(resolveTemplate('hello {{name}}', { name: 'world' })).toBe('hello world')
    })
    it('replaces multiple keys', () => {
      expect(resolveTemplate('{{greeting}} {{target}}', { greeting: 'hi', target: 'there' })).toBe('hi there')
    })
    it('leaves unchanged when key not in params', () => {
      expect(resolveTemplate('hello {{missing}}', {})).toBe('hello {{missing}}')
    })
    it('handles no template markers', () => {
      expect(resolveTemplate('plain text', {})).toBe('plain text')
    })
    it('handles empty string', () => {
      expect(resolveTemplate('', { x: 1 })).toBe('')
    })
    it('handles adjacent templates', () => {
      expect(resolveTemplate('{{a}}{{b}}', { a: 'x', b: 'y' })).toBe('xy')
    })
    it('matches word characters only (\\w)', () => {
      expect(resolveTemplate('{{key-name}}', { 'key-name': 'val' })).toBe('{{key-name}}')
    })
    it('handles numbers in key', () => {
      expect(resolveTemplate('{{item1}}', { item1: 'a' })).toBe('a')
    })
  })

  describe('executeActions', () => {
    it('dispatches launch action to launchApp', async () => {
      await executeActions([{ type: 'launch', package: 'com.test.app' }])
      expect(adb.launchApp).toHaveBeenCalledWith('com.test.app')
    })

    it('dispatches tap action', async () => {
      await executeActions([{ type: 'tap', x: 100, y: 200 }])
      expect(adb.tap).toHaveBeenCalledWith(100, 200)
    })

    it('dispatches swipe action', async () => {
      await executeActions([{ type: 'swipe', x1: 0, y1: 0, x2: 500, y2: 1000, duration: 500 }])
      expect(adb.swipe).toHaveBeenCalledWith(0, 0, 500, 1000, 500)
    })

    it('dispatches input_text with template resolution', async () => {
      await executeActions([{ type: 'input_text', content: 'hello {{user}}', x: 100, y: 200 }], { user: 'test' })
      expect(adb.tap).toHaveBeenCalledWith(100, 200)
    })

    it('dispatches screenshot', async () => {
      const result = await executeActions([{ type: 'screenshot', name: 'shot1' }])
      expect(adb.screenshot).toHaveBeenCalled()
      expect(result.screenshots).toHaveLength(1)
      expect(result.screenshots[0].name).toBe('shot1')
    })

    it('dispatches back', async () => {
      await executeActions([{ type: 'back' }])
      expect(adb.keyEvent).toHaveBeenCalledWith('back')
    })

    it('dispatches home', async () => {
      await executeActions([{ type: 'home' }])
      expect(adb.keyEvent).toHaveBeenCalledWith('home')
    })

    it('handles multiple actions in sequence', async () => {
      const result = await executeActions([
        { type: 'launch', package: 'com.app' },
        { type: 'tap', x: 10, y: 20 },
        { type: 'screenshot', name: 'end' },
      ])
      expect(adb.launchApp).toHaveBeenCalled()
      expect(adb.tap).toHaveBeenCalled()
      expect(result.screenshots).toHaveLength(1)
    })

    it('uses default swipe duration when not specified', async () => {
      await executeActions([{ type: 'swipe', x1: 0, y1: 0, x2: 1, y2: 1 }])
      expect(adb.swipe).toHaveBeenCalledWith(0, 0, 1, 1, 300)
    })
  })
})
