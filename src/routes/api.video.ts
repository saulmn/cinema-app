import { createFileRoute } from '@tanstack/react-router'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { validateSession, getMoviePath, loadState, getLocalDateString } from '../lib/state.server'
import fs from 'node:fs'
import { Readable } from 'node:stream'

export const Route = createFileRoute('/api/video')({
  server: {
    handlers: {
      GET: async (context) => {
        const headers = getRequestHeaders()
        const cookieHeader = headers.get('cookie')

        // 1. Authenticate user
        if (!validateSession(cookieHeader)) {
          return new Response('Unauthorized', { status: 401 })
        }

        // 2. Parse filename from query string
        const url = new URL(context.request.url)
        const filename = url.searchParams.get('file')
        if (!filename) {
          return new Response('Missing file parameter', { status: 400 })
        }

        // 3. Verify file is the active movie for today
        const state = loadState()
        const todayStr = getLocalDateString()
        const activeMovie = state.selectedMovies.find(m => m.watchedAt === todayStr)

        if (!activeMovie || activeMovie.filename !== filename) {
          return new Response('Access Denied: Movie is locked or not selected for today', { status: 403 })
        }

        // 4. Resolve safe local file path
        const filePath = getMoviePath(filename)
        if (!fs.existsSync(filePath)) {
          return new Response('Movie file not found on disk', { status: 404 })
        }

        const stats = fs.statSync(filePath)
        const fileSize = stats.size

        // 5. Handle range streaming
        const rangeHeader = context.request.headers.get('range')
        if (rangeHeader) {
          const parts = rangeHeader.replace(/bytes=/, '').split('-')
          const start = parseInt(parts[0], 10)
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1

          // Avoid out of bound ranges
          if (start >= fileSize || end >= fileSize) {
            return new Response('Requested Range Not Satisfiable', {
              status: 416,
              headers: { 'Content-Range': `bytes */${fileSize}` },
            })
          }

          const chunksize = end - start + 1
          const nodeStream = fs.createReadStream(filePath, { start, end })
          // Convert Node Stream to Web Stream
          const webStream = Readable.toWeb(nodeStream)

          return new Response(webStream as any, {
            status: 206,
            headers: {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': String(chunksize),
              'Content-Type': 'video/mp4',
            },
          })
        } else {
          // Send entire file (200 OK)
          const nodeStream = fs.createReadStream(filePath)
          const webStream = Readable.toWeb(nodeStream)

          return new Response(webStream as any, {
            status: 200,
            headers: {
              'Content-Length': String(fileSize),
              'Content-Type': 'video/mp4',
              'Accept-Ranges': 'bytes',
            },
          })
        }
      },
    },
  },
})
