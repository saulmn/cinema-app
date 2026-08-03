import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { getWeekStart, getLocalDateString, getMoviesList } from './state.server'

describe('Movies App State & Logic Tests', () => {
  describe('getLocalDateString', () => {
    it('should format date as YYYY-MM-DD in Mexico City time', () => {
      const testDate = new Date('2026-06-18T12:00:00Z')
      const formatted = getLocalDateString(testDate)
      expect(formatted).toBe('2026-06-18')
    })
  })

  describe('getWeekStart', () => {
    it('should find Monday midnight (00:00:00 Mexico Time) for a given Wednesday', () => {
      // Wednesday, June 17, 2026
      const date = new Date('2026-06-17T14:30:00-06:00')
      const start = getWeekStart(date)
      const startStr = getLocalDateString(start)
      
      expect(startStr).toBe('2026-06-15') // Monday before June 17 is June 15
    })

    it('should find Monday midnight if date is Sunday 10:00 AM', () => {
      // Sunday, June 21, 2026 at 10:00 AM
      const date = new Date('2026-06-21T10:00:00-06:00')
      const start = getWeekStart(date)
      const startStr = getLocalDateString(start)

      expect(startStr).toBe('2026-06-15') // Monday of that week is June 15
    })

    it('should find Monday midnight if date is Monday 10:00 AM', () => {
      // Monday, June 22, 2026 at 10:00 AM
      const date = new Date('2026-06-22T10:00:00-06:00')
      const start = getWeekStart(date)
      const startStr = getLocalDateString(start)

      expect(startStr).toBe('2026-06-22') // Monday is June 22
    })
  })

  describe('getMoviesList Limit Constraints', () => {
    const originalMoviesDir = process.env.MOVIES_DIR

    beforeEach(() => {
      // Create a temporary directory for test movies
      process.env.MOVIES_DIR = './test_movies_dir'
      if (fs.existsSync('./test_movies_dir')) {
        fs.rmSync('./test_movies_dir', { recursive: true, force: true })
      }
      fs.mkdirSync('./test_movies_dir')
    })

    afterEach(() => {
      // Clean up
      if (fs.existsSync('./test_movies_dir')) {
        fs.rmSync('./test_movies_dir', { recursive: true, force: true })
      }
      process.env.MOVIES_DIR = originalMoviesDir
    })

    it('should read all .mp4 files case-insensitively and ignore other formats', () => {
      fs.writeFileSync('./test_movies_dir/movie1.mp4', '')
      fs.writeFileSync('./test_movies_dir/movie2.MP4', '')
      fs.writeFileSync('./test_movies_dir/photo.jpg', '')
      fs.writeFileSync('./test_movies_dir/readme.txt', '')

      const list = getMoviesList()
      expect(list.length).toBe(2)
      expect(list).toContain('movie1.mp4')
      expect(list).toContain('movie2.MP4')
    })

    it('should throw an error if more than 80 .mp4 files are present', () => {
      // Create 81 dummy mp4 files
      for (let i = 1; i <= 81; i++) {
        fs.writeFileSync(`./test_movies_dir/movie_${i}.mp4`, '')
      }

      expect(() => getMoviesList()).toThrow(/restricted to a maximum of 80/)
    })
  })

  describe('loadState & getAppState Rotation Logic', () => {
    const originalMoviesDir = process.env.MOVIES_DIR
    const originalStatePath = process.env.STATE_PATH

    beforeEach(() => {
      process.env.MOVIES_DIR = './test_movies_dir'
      process.env.STATE_PATH = './test_state.json'
      if (fs.existsSync('./test_movies_dir')) {
        fs.rmSync('./test_movies_dir', { recursive: true, force: true })
      }
      if (fs.existsSync('./test_state.json')) {
        fs.rmSync('./test_state.json', { force: true })
      }
      if (fs.existsSync('./state.json')) {
        // backup if any
      }
      fs.mkdirSync('./test_movies_dir')
    })

    afterEach(() => {
      if (fs.existsSync('./test_movies_dir')) {
        fs.rmSync('./test_movies_dir', { recursive: true, force: true })
      }
      if (fs.existsSync('./test_state.json')) {
        fs.rmSync('./test_state.json', { force: true })
      }
      process.env.MOVIES_DIR = originalMoviesDir
      process.env.STATE_PATH = originalStatePath
    })

    it('should migrate state from fallback location if target STATE_PATH does not exist', async () => {
      const { loadState } = await import('./state.server')
      // Create a fallback state file at ./state.json
      const mockState = {
        currentWeekStart: '2026-06-15T06:00:00.000Z',
        selectedMovies: [],
        watchedMoviesHistory: ['m1.mp4'],
        displayedMoviesHistory: ['m1.mp4', 'm2.mp4', 'm3.mp4'],
        lastWeekSelected: [],
        sessionToken: 'test-token-123'
      }
      fs.writeFileSync('./state.json', JSON.stringify(mockState, null, 2))

      const loaded = loadState()
      expect(loaded.sessionToken).toBe('test-token-123')
      expect(loaded.watchedMoviesHistory).toContain('m1.mp4')
      expect(loaded.displayedMoviesHistory).toContain('m2.mp4')
      expect(fs.existsSync('./test_state.json')).toBe(true)

      // cleanup test state.json
      fs.rmSync('./state.json', { force: true })
    })

    it('should select unique movies each week until all library movies have been displayed', async () => {
      const { getAppState } = await import('./state.server')
      
      // Create 10 dummy movies
      for (let i = 1; i <= 10; i++) {
        fs.writeFileSync(`./test_movies_dir/movie_${i}.mp4`, '')
      }

      const allDisplayed = new Set<string>()

      // Week 1
      const { state: state1 } = getAppState()
      expect(state1.selectedMovies.length).toBe(3)
      state1.selectedMovies.forEach(m => allDisplayed.add(m.filename))

      // Force Week 2 by changing currentWeekStart
      state1.currentWeekStart = '2026-01-01T00:00:00.000Z'
      fs.writeFileSync('./test_state.json', JSON.stringify(state1, null, 2))

      const { state: state2 } = getAppState()
      expect(state2.selectedMovies.length).toBe(3)
      // Verify Week 2 movies were not in Week 1
      state2.selectedMovies.forEach(m => {
        expect(allDisplayed.has(m.filename)).toBe(false)
        allDisplayed.add(m.filename)
      })

      // Force Week 3
      state2.currentWeekStart = '2026-01-08T00:00:00.000Z'
      fs.writeFileSync('./test_state.json', JSON.stringify(state2, null, 2))

      const { state: state3 } = getAppState()
      expect(state3.selectedMovies.length).toBe(3)
      // Verify Week 3 movies were not in Week 1 or Week 2
      state3.selectedMovies.forEach(m => {
        expect(allDisplayed.has(m.filename)).toBe(false)
        allDisplayed.add(m.filename)
      })

      expect(allDisplayed.size).toBe(9) // 3 + 3 + 3 unique movies out of 10
    })
  })
})

