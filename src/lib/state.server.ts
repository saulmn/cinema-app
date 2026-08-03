import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface MovieOption {
  filename: string;
  watched: boolean;
  watchedAt: string | null; // YYYY-MM-DD
}

export interface AppState {
  currentWeekStart: string; // ISO string of Monday 12:00 AM Mexico Time
  selectedMovies: MovieOption[];
  watchedMoviesHistory: string[]; // filenames of all watched movies in the current cycle
  displayedMoviesHistory: string[]; // filenames of all selected/displayed movies in the current cycle
  lastWeekSelected: string[]; // filenames of movies selected last week
  sessionToken: string;
}

const APP_PASSWORD = process.env.APP_PASSWORD || 'movies';

export function getMoviesDir(): string {
  return process.env.MOVIES_DIR || './movies_dir';
}

export function getStatePath(): string {
  return process.env.STATE_PATH || './state.json';
}

// Helper to format date in America/Mexico_City as YYYY-MM-DD
export function getLocalDateString(date: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

// Helper to calculate the start of the week (Monday at 12:00 AM / 00:00:00 Mexico Time)
export function getWeekStart(date: Date = new Date()): Date {
  const dateStr = getLocalDateString(date);
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  const utcDay = d.getUTCDay();
  const daysToMonday = (utcDay + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysToMonday);

  const monYear = d.getUTCFullYear();
  const monMonth = String(d.getUTCMonth() + 1).padStart(2, '0');
  const monDay = String(d.getUTCDate()).padStart(2, '0');

  return new Date(`${monYear}-${monMonth}-${monDay}T00:00:00-06:00`);
}

// Helper to get all MP4 files from the movie directory
export function getMoviesList(): string[] {
  const dir = getMoviesDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return [];
  }

  const files = fs.readdirSync(dir);
  const mp4Files = files.filter(f => f.toLowerCase().endsWith('.mp4'));

  if (mp4Files.length > 80) {
    throw new Error(`The directory contains ${mp4Files.length} MP4 files. The app is restricted to a maximum of 80 files.`);
  }

  return mp4Files;
}

// Helper to get full path of a movie
export function getMoviePath(filename: string): string {
  // Basic security check: prevent directory traversal
  const safeFilename = path.basename(filename);
  return path.join(getMoviesDir(), safeFilename);
}

// Helper to choose random items
function chooseRandom(array: string[], count: number): string[] {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Load state from file or create a default state
export function loadState(): AppState {
  const statePath = getStatePath();
  const stateDir = path.dirname(statePath);
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }

  const defaultState: AppState = {
    currentWeekStart: '',
    selectedMovies: [],
    watchedMoviesHistory: [],
    displayedMoviesHistory: [],
    lastWeekSelected: [],
    sessionToken: crypto.randomUUID()
  };

  if (!fs.existsSync(statePath)) {
    // Check fallback paths for pre-existing state files to prevent state loss across environment / path changes
    const fallbackPaths = ['./app_data/state.json', './state.json'];
    let migratedState: AppState | null = null;

    for (const fbPath of fallbackPaths) {
      if (fbPath !== statePath && fs.existsSync(fbPath)) {
        try {
          const raw = fs.readFileSync(fbPath, 'utf-8');
          const parsed = JSON.parse(raw);
          migratedState = {
            currentWeekStart: parsed.currentWeekStart || '',
            selectedMovies: parsed.selectedMovies || [],
            watchedMoviesHistory: parsed.watchedMoviesHistory || [],
            displayedMoviesHistory: parsed.displayedMoviesHistory || parsed.watchedMoviesHistory || [],
            lastWeekSelected: parsed.lastWeekSelected || [],
            sessionToken: parsed.sessionToken || crypto.randomUUID()
          };
          console.log(`Migrated state from ${fbPath} to ${statePath}`);
          break;
        } catch (err) {
          console.error(`Error reading fallback state file ${fbPath}:`, err);
        }
      }
    }

    const stateToSave = migratedState || defaultState;
    saveState(stateToSave);
    return stateToSave;
  }

  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    const parsed = JSON.parse(raw);
    
    // Ensure all required fields exist
    return {
      currentWeekStart: parsed.currentWeekStart || '',
      selectedMovies: parsed.selectedMovies || [],
      watchedMoviesHistory: parsed.watchedMoviesHistory || [],
      displayedMoviesHistory: parsed.displayedMoviesHistory || parsed.watchedMoviesHistory || [],
      lastWeekSelected: parsed.lastWeekSelected || [],
      sessionToken: parsed.sessionToken || crypto.randomUUID()
    };
  } catch (err) {
    console.error('Error reading state file, using defaults:', err);
    return defaultState;
  }
}

// Save state to file
export function saveState(state: AppState): void {
  try {
    fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing state file:', err);
  }
}

// Verify auth session
export function validateSession(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const [name, ...value] = part.split('=');
    if (name) {
      cookies[name.trim()] = value.join('=').trim();
    }
  }
  
  const sessionToken = cookies['auth_session'];
  if (!sessionToken) return false;
  
  const state = loadState();
  return sessionToken === state.sessionToken;
}

// Login verification
export function loginUser(password: string): string | null {
  if (password === APP_PASSWORD) {
    const state = loadState();
    return state.sessionToken;
  }
  return null;
}

// Core business logic check (check/perform weekly rotation)
export function getAppState(): { state: AppState; error?: string } {
  let state = loadState();
  let allMovies: string[];
  
  try {
    allMovies = getMoviesList();
  } catch (err: any) {
    return { state, error: err.message };
  }

  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekStartStr = weekStart.toISOString();

  // Self-healing: check if any currently selected movie has been deleted on disk
  const missingSelected = state.selectedMovies.some(m => !allMovies.includes(m.filename));

  // If the week start has changed, OR if any selected movie has disappeared from disk, trigger a new roll
  if (state.currentWeekStart !== weekStartStr || missingSelected) {
    const lastWeekSelected = state.selectedMovies.map(m => m.filename);
    let watched = state.watchedMoviesHistory.filter(filename => allMovies.includes(filename));
    let displayed = (state.displayedMoviesHistory || []).filter(filename => allMovies.includes(filename));

    // Exclude all movies already shown or watched in this cycle
    const seenMovies = Array.from(new Set([...displayed, ...watched]));

    // Calculate the pool of unseen/unwatched movies in the current cycle
    let unseenPool = allMovies.filter(m => !seenMovies.includes(m));
    
    let selected: string[] = [];
    const targetCount = Math.min(3, allMovies.length);

    if (targetCount > 0) {
      if (unseenPool.length >= targetCount) {
        selected = chooseRandom(unseenPool, targetCount);
      } else {
        // Pool exhausted or smaller than target count -> start with remaining unseen
        selected = [...unseenPool];
        const remainingNeeded = targetCount - selected.length;
        
        // Reset cycle histories since the entire library pool has been cycled!
        displayed = [];
        watched = [];

        const refreshedPool = allMovies.filter(m => !selected.includes(m));
        const additional = chooseRandom(refreshedPool, Math.min(remainingNeeded, refreshedPool.length));
        selected = [...selected, ...additional];
      }
    }

    displayed = Array.from(new Set([...displayed, ...selected]));

    state.currentWeekStart = weekStartStr;
    state.lastWeekSelected = lastWeekSelected;
    state.selectedMovies = selected.map(filename => ({
      filename,
      watched: false,
      watchedAt: null
    }));
    state.watchedMoviesHistory = watched;
    state.displayedMoviesHistory = displayed;
    
    saveState(state);
  }

  return { state };
}

// Business logic to watch/reveal a movie option
export function openMovieToday(index: number): { filename: string } | { error: string } {
  const { state, error } = getAppState();
  if (error) return { error };

  if (index < 0 || index >= state.selectedMovies.length) {
    return { error: 'Invalid movie option selection.' };
  }

  const todayStr = getLocalDateString();
  const selectedMovie = state.selectedMovies[index];

  // 1. Check if this specific option has already been watched/revealed
  if (selectedMovie.watched) {
    // If it was watched today, they can re-open it
    if (selectedMovie.watchedAt === todayStr) {
      return { filename: selectedMovie.filename };
    }
    return { error: 'This movie option has already been watched this week.' };
  }

  // 2. Check if ANY movie was watched today
  const activeMovieToday = state.selectedMovies.find(m => m.watchedAt === todayStr);
  if (activeMovieToday) {
    return { error: 'You have already watched a movie today. You can open another option tomorrow.' };
  }

  // 3. Mark as watched/revealed
  selectedMovie.watched = true;
  selectedMovie.watchedAt = todayStr;
  
  if (!state.watchedMoviesHistory.includes(selectedMovie.filename)) {
    state.watchedMoviesHistory.push(selectedMovie.filename);
  }

  saveState(state);
  return { filename: selectedMovie.filename };
}

