import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface MovieOption {
  filename: string;
  watched: boolean;
  watchedAt: string | null; // YYYY-MM-DD
}

export interface AppState {
  currentWeekStart: string; // ISO string of Sunday 12:00 AM
  selectedMovies: MovieOption[];
  watchedMoviesHistory: string[]; // filenames of all watched movies in the current cycle
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

// Helper to format local date as YYYY-MM-DD
export function getLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to calculate the start of the week (Sunday at 12:00 AM / 00:00:00)
export function getWeekStart(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const day = result.getDay(); // 0 is Sunday, 1 is Monday, etc.
  result.setDate(result.getDate() - day);
  return result;
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

  if (mp4Files.length > 40) {
    throw new Error(`The directory contains ${mp4Files.length} MP4 files. The app is restricted to a maximum of 40 files.`);
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
    lastWeekSelected: [],
    sessionToken: crypto.randomUUID()
  };

  if (!fs.existsSync(statePath)) {
    saveState(defaultState);
    return defaultState;
  }

  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    const parsed = JSON.parse(raw);
    
    // Ensure all required fields exist
    return {
      currentWeekStart: parsed.currentWeekStart || '',
      selectedMovies: parsed.selectedMovies || [],
      watchedMoviesHistory: parsed.watchedMoviesHistory || [],
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
    let watched = state.watchedMoviesHistory;
    
    // Filter out movies that have been deleted from disk from the watched history
    watched = watched.filter(filename => allMovies.includes(filename));

    // Calculate the pool of unwatched movies
    let pool = allMovies.filter(m => !watched.includes(m));
    
    let selected: string[] = [];
    const targetCount = Math.min(3, allMovies.length);

    if (targetCount > 0) {
      // Candidates excluding last week's selected movies
      const candidates = pool.filter(m => !lastWeekSelected.includes(m));
      
      if (candidates.length >= targetCount) {
        selected = chooseRandom(candidates, targetCount);
      } else {
        // Fallback to full unwatched pool if excluding last week is too restrictive
        if (pool.length >= targetCount) {
          selected = chooseRandom(pool, targetCount);
        } else {
          // Unwatched pool is exhausted, reset history
          selected = [...pool];
          const remainingNeeded = targetCount - selected.length;
          
          watched = []; // Reset the global cycle!
          
          const newPool = allMovies.filter(m => !selected.includes(m));
          const additional = chooseRandom(newPool, Math.min(remainingNeeded, newPool.length));
          selected = [...selected, ...additional];
        }
      }
    }

    state.currentWeekStart = weekStartStr;
    state.lastWeekSelected = lastWeekSelected;
    state.selectedMovies = selected.map(filename => ({
      filename,
      watched: false,
      watchedAt: null
    }));
    state.watchedMoviesHistory = watched;
    
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
