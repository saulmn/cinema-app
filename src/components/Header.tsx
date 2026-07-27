import { Link, useRouter } from '@tanstack/react-router'
import ThemeToggle from './ThemeToggle'
import { logoutFn } from '../routes/login'
import { LogOut, Film } from 'lucide-react'

export default function Header() {
  const router = useRouter()

  const handleLogout = async () => {
    try {
      await logoutFn()
      router.invalidate()
      window.location.href = '/login' // Hard redirect to reset auth state
    } catch (err) {
      console.error('Logout failed:', err)
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-lg">
      <nav className="page-wrap flex items-center justify-between py-3 sm:py-4">
        <h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-3 py-1.5 text-sm text-[var(--sea-ink)] no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)] sm:px-4 sm:py-2"
          >
            <Film className="h-4.5 w-4.5 text-[#2f6a4a] dark:text-[#60d7cf] transition-colors" />
            <span className="font-extrabold tracking-tight text-[var(--sea-ink)]">Random Cinema</span>
          </Link>
        </h2>

        <div className="flex items-center gap-2.5 sm:gap-4">
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3.5 py-1.5 text-xs font-bold text-red-500 dark:text-red-400 transition hover:bg-red-500/20 active:scale-95 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </nav>
    </header>
  )
}
