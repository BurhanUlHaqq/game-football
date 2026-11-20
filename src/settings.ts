export const qualities = ['low', 'medium', 'high', 'auto'] as const;
export const audioModes = ['auto', 'muted'] as const;
export const hudModes = ['minimal', 'off'] as const;
export const rates = [30, 60] as const;
export type Preferences = {
  quality: typeof qualities[number]; audio: typeof audioModes[number]; hud: typeof hudModes[number];
  fps: typeof rates[number]; master: number; music: number; effects: number; commentary: number;
};
export type Settings = Preferences & { names: [string, string]; seed: string; mode: 'stream' | 'operator' | 'debug' | 'capture'; session: 'resume' | 'new' };
export type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const preferenceKey = 'zeerush.preferences.v1';
const defaultNames: [string, string] = ['ROUNDHOUSE FC', 'SCRUFF FC'];

export function browserStorage(): StorageAccess | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

export function readJSON(storage: StorageAccess | undefined, key: string): unknown {
  try { return JSON.parse(storage?.getItem(key) ?? 'null') as unknown; } catch { return null; }
}

export function writeJSON(storage: StorageAccess | undefined, key: string, value: unknown) {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* Private or full storage is optional. */ }
}

export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function choose<T>(value: unknown, choices: readonly T[], fallback: T): T {
  return choices.includes(value as T) ? value as T : fallback;
}

function volume(n: unknown, fallback: number) {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
}

export function sanitizeName(value: unknown, fallback: string) {
  return typeof value === 'string' && /^[\p{L}\p{N} .&'’-]{1,22}$/u.test(value.trim()) ? value.trim() : fallback;
}

export function settingsFrom(search: string, storage?: StorageAccess): Settings {
  const query = new URLSearchParams(search);
  const saved = readJSON(storage, preferenceKey);
  const pref = record(saved) ? saved : {};
  const seed = query.get('seed') ?? '';
  const mode = choose(query.get('mode'), ['stream', 'operator', 'debug', 'capture'] as const, 'stream');
  return {
    quality: choose(query.get('quality') ?? pref.quality, qualities, 'auto'),
    audio: choose(query.get('audio') ?? pref.audio, audioModes, 'auto'),
    hud: choose(query.get('hud') ?? pref.hud, hudModes, 'minimal'),
    fps: choose(query.has('fps') ? Number(query.get('fps')) : mode === 'capture' ? 30 : pref.fps, rates, mode === 'capture' ? 30 : 60),
    master: volume(pref.master, 0.62), music: volume(pref.music, 0), effects: volume(pref.effects, 0.78),
    commentary: query.get('commentary') === 'off' ? 0 : query.get('commentary') === 'on' ? 0.88 : volume(pref.commentary, 0.88),
    names: [sanitizeName(query.get('teamA'), defaultNames[0]), sanitizeName(query.get('teamB'), defaultNames[1])],
    seed: /^[\w.-]{1,48}$/.test(seed) ? seed : 'zeerush',
    mode,
    session: choose(query.get('session'), ['resume', 'new'] as const, 'new'),
  };
}

export function savePreferences(storage: StorageAccess | undefined, settings: Settings) {
  const { quality, audio, hud, fps, master, music, effects, commentary } = settings;
  writeJSON(storage, preferenceKey, { quality, audio, hud, fps, master, music, effects, commentary });
}

export type Checkpoint = {
  version: 2; identity: string; random: number; ticks: number; scores: Score; goalId: number;
  firstKickoff: 0 | 1; restartTeam: 0 | 1; teams: [string, string]; seed: string; config: Preferences;
  seriesGoals: Score; wins: Score; draws: number; shots: Score; saves: Score; scorers: number[];
};

const checkpointKey = 'zeerush.match.v2';
export const matchIdentity = (seed: string, names: [string, string]) => JSON.stringify([seed, ...names]);

export function loadCheckpoint(storage: StorageAccess | undefined, settings: Settings): Checkpoint | undefined {
  if (settings.session === 'new') return undefined;
  const value = readJSON(storage, checkpointKey);
  if (!record(value) || value.version !== 2 || value.identity !== matchIdentity(settings.seed, settings.names)) return undefined;
  if (!integer(value.random, 0xffffffff) || !integer(value.ticks) || !integer(value.goalId)) return undefined;
  const { scores, seriesGoals, wins, draws } = value;
  if (!scorePair(scores) || !scorePair(seriesGoals) || !scorePair(wins) || !integer(draws) || !scorePair(value.shots) || !scorePair(value.saves)) return undefined;
  if (seriesGoals[0] + seriesGoals[1] !== value.goalId || seriesGoals.some((score, i) => score < scores[i]) || wins[0] + wins[1] + draws !== matchNumberAt(value.ticks) - 1) return undefined;
  if (!Array.isArray(value.scorers) || value.scorers.length !== 10 || !value.scorers.every(n => integer(n))) return undefined;
  if (value.firstKickoff !== 0 && value.firstKickoff !== 1) return undefined;
  if ((value.restartTeam !== 0 && value.restartTeam !== 1) || value.seed !== settings.seed || !Array.isArray(value.teams) || value.teams.length !== 2 || value.teams.some((name, i) => name !== settings.names[i]) || !record(value.config)) return undefined;
  return value as Checkpoint;
}

const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;
const scorePair = (value: unknown): value is Score => Array.isArray(value) && value.length === 2 && value.every(n => integer(n));
export const saveCheckpoint = (storage: StorageAccess | undefined, checkpoint: Checkpoint) => writeJSON(storage, checkpointKey, checkpoint);
import { matchNumberAt } from './football';
import type { Score } from './football';

