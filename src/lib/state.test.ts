import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { getWeekStart, getLocalDateString, getMoviesList } from './state.server'

describe('Movies App State & Logic Tests', () => {
  describe('getLocalDateString', () => {
    it('should format date as YYYY-MM-DD', () => {
      const testDate = new Date(2026, 5, 18) // June 18, 2026 (0-indexed month)
      const formatted = getLocalDateString(testDate)
      expect(formatted).toBe('2026-06-18')
    })
  })

  describe('getWeekStart', () => {
    it('should find Sunday midnight (00:00:00) for a given Wednesday', () => {
      // Wednesday, June 17, 2026
      const date = new Date(2026, 5, 17, 14, 30, 0)
      const start = getWeekStart(date)
      
      expect(start.getDay()).toBe(0) // Sunday
      expect(start.getFullYear()).toBe(2026)
      expect(start.getMonth()).toBe(5) // June
      expect(start.getDate()).toBe(14) // Sunday before June 17 is June 14
      expect(start.getHours()).toBe(0)
      expect(start.getMinutes()).toBe(0)
      expect(start.getSeconds()).toBe(0)
    })

    it('should find today midnight if date is Sunday 10:00 AM', () => {
      // Sunday, June 21, 2026 at 10:00 AM
      const date = new Date(2026, 5, 21, 10, 0, 0)
      const start = getWeekStart(date)

      expect(start.getDay()).toBe(0) // Sunday
      expect(start.getFullYear()).toBe(2026)
      expect(start.getMonth()).toBe(5) // June
      expect(start.getDate()).toBe(21) // Same day
      expect(start.getHours()).toBe(0)
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

    it('should throw an error if more than 40 .mp4 files are present', () => {
      // Create 41 dummy mp4 files
      for (let i = 1; i <= 41; i++) {
        fs.writeFileSync(`./test_movies_dir/movie_${i}.mp4`, '')
      }

      expect(() => getMoviesList()).toThrow(/restricted to a maximum of 40/)
    })
  })
})
