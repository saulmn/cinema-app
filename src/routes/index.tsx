import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { Play, Lock, Film, Calendar, CheckCircle2, ChevronRight, BarChart2 } from 'lucide-react'

// Server function to fetch initial state and overall cycle stats safely
export const getAppStateFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { getAppState, getLocalDateString, getMoviesList } = await import('../lib/state.server')
    const { state, error } = getAppState()
    const todayStr = getLocalDateString()

    // Get total movies list to show progress
    let totalCount = 0
    try {
      totalCount = getMoviesList().length
    } catch (err) {
      // Ignored here
    }

    if (error || !state) {
      return { state: null, error: error || 'Failed to load app state', totalCount: 0, watchedCount: 0 }
    }

    // Mask filename for security/anonymity unless it's watched today
    const clientSelectedMovies = state.selectedMovies.map((m) => ({
      filename: m.watchedAt === todayStr ? m.filename : null,
      watched: m.watched,
      watchedAt: m.watchedAt,
    }))

    const clientState = {
      currentWeekStart: state.currentWeekStart,
      selectedMovies: clientSelectedMovies,
    }

    return {
      state: clientState,
      error: null,
      totalCount,
      watchedCount: state.watchedMoviesHistory.length,
    }
  })

// Server function to unlock and open a movie
export const openMovieFn = createServerFn({ method: 'POST' })
  .validator((index: number) => index)
  .handler(async ({ data: index }) => {
    const { openMovieToday } = await import('../lib/state.server')
    const result = openMovieToday(index)
    if ('error' in result) {
      throw new Error(result.error)
    }
    return result // returns { filename: string }
  })

export const Route = createFileRoute('/')({
  loader: async () => {
    return getAppStateFn()
  },
  component: Dashboard,
})

function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function Dashboard() {
  const { state, error, totalCount, watchedCount } = Route.useLoaderData()
  const [loadingIndex, setLoadingIndex] = useState<number | null>(null)
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const navigate = useNavigate()

  if (error) {
    return (
      <main className="page-wrap px-4 py-16 text-center">
        <div className="mx-auto max-w-md rounded-3xl border border-red-500/20 bg-red-500/10 p-8 shadow-2xl backdrop-blur-md">
          <Film className="mx-auto h-12 w-12 text-red-400" />
          <h2 className="mt-4 text-2xl font-bold text-white">System Configuration Error</h2>
          <p className="mt-2 text-sm text-red-200">{error}</p>
        </div>
      </main>
    )
  }

  if (!state || state.selectedMovies.length === 0) {
    return (
      <main className="page-wrap px-4 py-16 text-center">
        <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl backdrop-blur-md">
          <Film className="mx-auto h-12 w-12 text-gray-400 animate-pulse" />
          <h2 className="mt-4 text-2xl font-bold text-white">No Movies Found</h2>
          <p className="mt-2 text-sm text-gray-400">
            Please copy some <code>.mp4</code> files (max 40) into the movies folder to begin.
          </p>
        </div>
      </main>
    )
  }

  const todayStr = getLocalDateString()
  
  // Find if there is an active movie for today
  const activeMovie = state.selectedMovies.find(m => m.watchedAt === todayStr)
  
  // Count how many movies have been watched this week
  const weeklyWatchedCount = state.selectedMovies.filter(m => m.watched).length

  // Calculate percentage for progress bar
  const progressPercent = totalCount > 0 ? Math.round((watchedCount / totalCount) * 100) : 0

  const handleOpenMovie = async (index: number) => {
    setActionError(null)
    setLoadingIndex(index)
    setConfirmIndex(null)

    try {
      const result = await openMovieFn({ data: index })
      // Redirect to the watch page
      navigate({ to: `/watch/$filename`, params: { filename: result.filename } })
    } catch (err: any) {
      setActionError(err.message || 'Failed to open movie')
      setLoadingIndex(null)
    }
  }

  // Format week start date nicely
  const weekStart = new Date(state.currentWeekStart)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <main className="page-wrap px-4 pb-16 pt-8 text-white min-h-[calc(100vh-80px)]">
      {/* Top Banner / Stats */}
      <section className="grid gap-6 md:grid-cols-3 mb-10">
        <div className="island-shell rounded-2xl p-6 relative overflow-hidden bg-white/[0.02] border border-white/5 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#60d7cf]/10 text-[#60d7cf]">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Active Week</p>
              <p className="text-sm font-bold mt-0.5">
                {formatDate(weekStart)} - {formatDate(weekEnd)}
              </p>
            </div>
          </div>
        </div>

        <div className="island-shell rounded-2xl p-6 relative overflow-hidden bg-white/[0.02] border border-white/5 shadow-xl md:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-[#6ec89a]/10 text-[#6ec89a]">
                <BarChart2 className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Overall Library Cycle</p>
                <p className="text-sm font-bold mt-0.5">
                  {watchedCount} / {totalCount} movies watched ({progressPercent}%)
                </p>
              </div>
            </div>
            {/* Progress Bar */}
            <div className="w-full sm:w-48 bg-white/10 h-2.5 rounded-full overflow-hidden self-center border border-white/5">
              <div 
                className="bg-gradient-to-r from-[#60d7cf] to-[#6ec89a] h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(96,215,207,0.5)]" 
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Main Instructions & Alerts */}
      <section className="mb-10 text-center max-w-2xl mx-auto">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
          Weekly Screening Room
        </h1>
        <p className="mt-3 text-sm sm:text-base text-gray-400">
          Every week, 3 random movies are selected from your library. Only one movie can be opened per day.
          Choose wisely: once opened, it is revealed and must be watched today, while other options lock.
        </p>

        {actionError && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            <p>{actionError}</p>
          </div>
        )}
      </section>

      {/* Movies Grid */}
      <section className="grid gap-6 sm:grid-cols-3 max-w-4xl mx-auto">
        {state.selectedMovies.map((movie, index) => {
          const isWatchedToday = movie.watchedAt === todayStr
          const isWatchedOtherDay = movie.watched && !isWatchedToday
          const isDisabled = (activeMovie && !isWatchedToday) || isWatchedOtherDay
          const isSelectable = !activeMovie && !movie.watched
          const isPendingConfirm = confirmIndex === index

          return (
            <div
              key={index}
              className={`relative flex flex-col justify-between rounded-3xl border p-6 transition-all duration-300 shadow-lg group
                ${isWatchedToday 
                  ? 'border-[#60d7cf]/30 bg-[#60d7cf]/[0.02] shadow-[#60d7cf]/5 hover:border-[#60d7cf]/40' 
                  : isWatchedOtherDay 
                    ? 'border-white/5 bg-white/[0.01] opacity-40' 
                    : isDisabled 
                      ? 'border-white/5 bg-white/[0.01] opacity-40' 
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05] hover:-translate-y-1'
                }
              `}
            >
              {/* Card top */}
              <div>
                <div className="flex justify-between items-start">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                    Option {index + 1}
                  </span>
                  {isWatchedToday && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#60d7cf]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#60d7cf] uppercase tracking-wider">
                      Active Today
                    </span>
                  )}
                  {isWatchedOtherDay && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      Watched
                    </span>
                  )}
                  {isSelectable && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#6ec89a]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#6ec89a] uppercase tracking-wider animate-pulse">
                      Available
                    </span>
                  )}
                </div>

                <div className="my-8 flex justify-center">
                  <div className={`flex h-20 w-20 items-center justify-center rounded-2xl transition-all duration-300
                    ${isWatchedToday 
                      ? 'bg-gradient-to-br from-[#60d7cf]/20 to-[#6ec89a]/20 text-[#60d7cf] scale-110 shadow-lg shadow-[#60d7cf]/10' 
                      : isWatchedOtherDay
                        ? 'bg-white/5 text-gray-600'
                        : isDisabled 
                          ? 'bg-white/5 text-gray-600' 
                          : 'bg-white/10 text-gray-300 group-hover:scale-105 group-hover:bg-[#60d7cf]/10 group-hover:text-[#60d7cf]'
                    }
                  `}>
                    {isWatchedOtherDay ? (
                      <CheckCircle2 className="h-10 w-10" />
                    ) : isDisabled ? (
                      <Lock className="h-10 w-10" />
                    ) : (
                      <Film className="h-10 w-10" />
                    )}
                  </div>
                </div>

                <div className="text-center mb-6">
                  {isWatchedToday && movie.filename ? (
                    <div>
                      <h3 className="font-bold text-lg text-white truncate max-w-full px-2" title={movie.filename}>
                        {movie.filename.replace(/\.[^/.]+$/, "")}
                      </h3>
                      <p className="text-xs text-gray-400 mt-1">Unlocked & Available</p>
                    </div>
                  ) : (
                    <div>
                      <h3 className="font-bold text-lg text-gray-300">Mystery Movie</h3>
                      <p className="text-xs text-gray-500 mt-1">
                        {isWatchedOtherDay ? 'Already screened' : isDisabled ? 'Locked for today' : 'Identity hidden'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Card actions */}
              <div className="mt-auto">
                {isWatchedToday && movie.filename ? (
                  <Link
                    to="/watch/$filename"
                    params={{ filename: movie.filename }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#60d7cf] to-[#6ec89a] py-3 text-sm font-bold text-[#0a1418] shadow-lg shadow-[#60d7cf]/10 transition hover:opacity-95 active:scale-95 cursor-pointer"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Resume Watching
                  </Link>
                ) : isWatchedOtherDay ? (
                  <button
                    disabled
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 py-3 text-sm font-bold text-gray-500 cursor-not-allowed border border-white/5"
                  >
                    Screening Completed
                  </button>
                ) : isDisabled ? (
                  <button
                    disabled
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 py-3 text-sm font-bold text-gray-600 cursor-not-allowed border border-white/5"
                  >
                    <Lock className="h-4 w-4" />
                    Locked Today
                  </button>
                ) : isPendingConfirm ? (
                  <div className="space-y-2 text-center animate-fade-in">
                    <p className="text-xs text-yellow-400 font-semibold px-1 leading-relaxed">
                      Confirm? Other movies lock until tomorrow.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleOpenMovie(index)}
                        disabled={loadingIndex !== null}
                        className="flex-1 rounded-xl bg-[#6ec89a] py-2 text-xs font-bold text-[#0a1418] hover:bg-[#5bba89] transition cursor-pointer"
                      >
                        {loadingIndex === index ? 'Opening...' : 'Yes, Open'}
                      </button>
                      <button
                        onClick={() => setConfirmIndex(null)}
                        disabled={loadingIndex !== null}
                        className="flex-1 rounded-xl bg-white/10 py-2 text-xs font-bold text-white hover:bg-white/20 transition cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmIndex(index)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#60d7cf]/20 bg-[#60d7cf]/5 py-3 text-sm font-bold text-[#60d7cf] transition hover:bg-[#60d7cf]/15 hover:border-[#60d7cf]/30 active:scale-95 cursor-pointer"
                  >
                    Choose Movie
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </section>

      {/* Bottom Info Banner */}
      {weeklyWatchedCount === 3 && (
        <section className="mt-12 max-w-md mx-auto text-center p-6 rounded-3xl border border-[#6ec89a]/20 bg-[#6ec89a]/5">
          <CheckCircle2 className="mx-auto h-8 w-8 text-[#6ec89a]" />
          <h3 className="mt-2 font-bold text-white">All Weekly Screenings Completed</h3>
          <p className="mt-1 text-xs text-gray-400">
            You have watched all 3 movies for this week. Come back Sunday at 12:00 AM for the next batch!
          </p>
        </section>
      )}
    </main>
  )
}
