/** The bridge to the Electron main process (studio/preload.cjs). */
export interface Env {
  platform: string; gitBash: boolean;
  claude: string | null; version?: string; loggedIn: boolean; authMethod?: string | null; email?: string | null;
  node: boolean; deps: boolean; tools: string; port: number;
  installing?: boolean; installError?: string | null;   // Claude Code background install
}
export interface Fix { n: number; done: boolean; text: string }
export interface Game { slug: string; thumb: boolean; engine: string; pitch: string; created: number; title: string; tagline: string; color: string; controls: string; fixes: Fix[]; session: boolean }
/** "choose the look": options Claude rendered (scripts/ask.mjs) for the user to pick from */
export interface AskOption { label: string; note: string; asset: string; tint: string | null; image: string }
export interface Ask { slug: string; title: string; created: number; questions: { id: string; question: string; options: AskOption[] }[] }
export interface RunResult { code: number; stdout: string; stderr: string }
export type ChatEvent =
  | { key: string; type: 'start' }
  | { key: string; type: 'text' | 'tool' | 'error'; text: string }
  | { key: string; type: 'result'; ok: boolean; text: string; denials: { tool: string; input: Record<string, unknown> }[] }
  | { key: string; type: 'end'; code: number; newGame: string | null; error: string; auth: boolean; ask?: Ask | null };

export interface StudioApi {
  platform: string;
  setTheme(dark: boolean): Promise<void>;
  installGit(): Promise<void>;
  checkEnv(): Promise<Env>;
  login(): Promise<void>;
  installClaude(opts?: { terminal?: boolean }): Promise<void>;
  games(): Promise<Game[]>;
  send(key: string, text: string, slug: string | null): Promise<void>;
  stop(key: string): Promise<void>;
  resetChat(key: string): Promise<void>;
  answerChoices(slug: string, picks: Record<string, string> | null): Promise<void>;
  allow(rule: string): Promise<void>;
  applyFix(slug: string, n: number | 'all'): Promise<RunResult>;
  undoFix(slug: string, n: number | 'all'): Promise<RunResult>;
  exportGame(slug: string): Promise<RunResult>;
  openExternal(url: string): Promise<void>;
  openFolder(slug: string | null): Promise<void>;
  onChat(fn: (ev: ChatEvent) => void): () => void;
  onTools(fn: (status: string) => void): () => void;
  onEnvChanged(fn: () => void): () => void;
  onMenu(fn: (action: string) => void): () => void;
  onGamesChanged(fn: () => void): () => void;
}

declare global { interface Window { studio?: StudioApi } }
export const studio = (): StudioApi | null => (typeof window !== 'undefined' ? window.studio ?? null : null);
export const NEW = '__new__';   // tab / chat key for "make a new game"
export const PAGE_ARCADE = 'page:arcade', PAGE_ASSETS = 'page:assets';
export const TEMPLATES = [
  { id: 'topdown', name: 'Top-down shooter', note: 'Waves, upgrades, lots of enemies' },
  { id: 'platformer', name: 'Platformer', note: 'Jumping, levels, pixel art' },
  { id: 'puzzle', name: 'Puzzle', note: 'Grid and turn based, with undo' },
  { id: 'physics', name: 'Physics', note: 'Slingshots, stacking, golf' },
  { id: '3d', name: '3D', note: 'Driving, exploring, first person' },
  { id: 'blank', name: 'Blank 2D', note: 'Anything else' },
] as const;

/** platform words and shortcut labels (macOS vs Windows) */
export const IS_MAC = typeof window === 'undefined' || (window.studio?.platform ?? 'darwin') === 'darwin';
export const kbd = (k: string) => (IS_MAC ? `⌘${k}` : `Ctrl+${k}`);
export const FILE_MANAGER = IS_MAC ? 'Finder' : 'File Explorer';
