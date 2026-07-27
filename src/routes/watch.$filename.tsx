import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { checkAuthFn } from './login'
import { ChevronLeft, Film } from 'lucide-react'

// Server function to verify that the requested file matches today's active unlocked movie
export const verifyWatchFn = createServerFn({ method: 'GET' })
  .validator((filename: string) => filename)
  .handler(async ({ data: filename }) => {
    const { getAppState, getLocalDateString } = await import('../lib/state.server')
    const { state, error } = getAppState()
    if (error || !state) {
      return { allowed: false }
    }

    const todayStr = getLocalDateString()
    const activeMovie = state.selectedMovies.find((m) => m.watchedAt === todayStr)

    if (!activeMovie || activeMovie.filename !== filename) {
      return { allowed: false }
    }

    return { allowed: true }
  })

export const Route = createFileRoute('/watch/$filename')({
  loader: async ({ params }) => {
    // 1. Verify user is logged in
    const { isAuthenticated } = await checkAuthFn()
    if (!isAuthenticated) {
      throw redirect({ to: '/login' })
    }

    const { filename } = params

    // 2. Load and verify state via server function
    const { allowed } = await verifyWatchFn({ data: filename })
    if (!allowed) {
      throw redirect({ to: '/' })
    }

    return { filename }
  },
  component: WatchPlayer,
})

function WatchPlayer() {
  const { filename } = Route.useLoaderData()
  const cleanTitle = filename.replace(/\.[^/.]+$/, '')

  return (
    <div className="min-h-screen bg-[#05090b] text-white flex flex-col">
      {/* Upper Navigation Bar */}
      <header className="z-10 border-b border-white/5 bg-[#05090b]/80 px-4 py-4 backdrop-blur-md">
        <div className="page-wrap flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-gray-300 no-underline transition hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Cinema
          </Link>
          <div className="flex items-center gap-2 max-w-[50%]">
            <Film className="h-4 w-4 text-[#60d7cf] flex-shrink-0" />
            <h1 className="text-sm font-bold truncate text-gray-200" title={cleanTitle}>
              {cleanTitle}
            </h1>
          </div>
          <div className="w-24 hidden sm:block" /> {/* Balance spacer */}
        </div>
      </header>

      {/* Video Viewport Container */}
      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-5xl aspect-video rounded-3xl overflow-hidden border border-white/10 bg-black shadow-2xl relative shadow-black/80">
          <video
            controls
            autoPlay
            controlsList="nodownload"
            src={`/api/video?file=${encodeURIComponent(filename)}`}
            className="w-full h-full object-contain"
          >
            Your browser does not support the video tag.
          </video>
        </div>
      </main>
    </div>
  )
}
