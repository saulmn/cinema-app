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
})
