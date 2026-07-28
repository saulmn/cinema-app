import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { setCookie, getRequestHeaders } from '@tanstack/react-start/server'
import { useState } from 'react'
import { Film, Lock, AlertCircle, Eye, EyeOff } from 'lucide-react'

// Server function to authenticate
export const loginFn = createServerFn({ method: 'POST' })
  .validator((password: string) => password)
  .handler(async ({ data: password }) => {
    const { loginUser } = await import('../lib/state.server')
    const token = loginUser(password)
    if (!token) {
      throw new Error('Invalid credentials')
    }

    setCookie('auth_session', token, {
      httpOnly: true,
      secure: process.env.SECURE_COOKIE === 'true',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 1 week
    })

    return { success: true }
  })

// Server function to check auth status
export const checkAuthFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { validateSession } = await import('../lib/state.server')
    const headers = getRequestHeaders()
    const cookieHeader = headers.get('cookie')
    return { isAuthenticated: validateSession(cookieHeader) }
  })

// Server function to log out
export const logoutFn = createServerFn({ method: 'POST' })
  .handler(async () => {
    setCookie('auth_session', '', {
      httpOnly: true,
      secure: process.env.SECURE_COOKIE === 'true',
      sameSite: 'lax',
      path: '/',
      maxAge: 0, // Immediately expire
    })
    return { success: true }
  })

export const Route = createFileRoute('/login')({
  component: Login,
})

function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) {
      setError('Password is required')
      return
    }

    setError(null)
    setLoading(true)

    try {
      await loginFn({ data: password })
      // Refresh state and redirect
      router.invalidate()
      window.location.href = '/' // Force hard redirect to reload auth state cleanly
    } catch (err: any) {
      setError(err.message || 'Incorrect password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070d10] px-4 text-white">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(96,215,207,0.12),transparent_70%)] blur-2xl" />
        <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(110,200,154,0.08),transparent_70%)] blur-2xl" />
      </div>

      <div className="w-full max-w-md rise-in z-10">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#60d7cf] to-[#6ec89a] shadow-lg shadow-[#60d7cf]/20">
            <Film className="h-7 w-7 text-[#0a1418]" />
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white font-sans">
            Random Cinema
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            Enter password to enter private screening
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl backdrop-blur-xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
                <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-400" />
                <p>{error}</p>
              </div>
            )}

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-gray-300 mb-2">
                Screening Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-5 w-5 text-gray-500" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="block w-full rounded-xl border border-white/10 bg-white/[0.05] py-3 pl-10 pr-10 text-white placeholder-gray-500 outline-none transition focus:border-[#60d7cf]/50 focus:bg-white/[0.08] focus:ring-1 focus:ring-[#60d7cf]/35 disabled:opacity-50 text-sm"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-white transition disabled:opacity-50"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-[#60d7cf] to-[#6ec89a] py-3 text-sm font-bold text-[#0a1418] transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[#60d7cf] focus:ring-offset-2 focus:ring-offset-[#070d10] disabled:opacity-50"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#0a1418] border-t-transparent" />
              ) : (
                'Enter Screening Room'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
