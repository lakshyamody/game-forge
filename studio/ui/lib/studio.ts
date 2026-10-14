/** The bridge to the Electron main process (studio/preload.cjs). */
export interface Env {
  claude: string | null; version?: string; loggedIn: boolean; authMethod?: string | null; email?: string | null;
  node: boolean; deps: boolean; tools: string; port: number;
}
export interface Fix { n: number; done: boolean; text: string }
export interface Game { slug: string; title: string; tagline: string; color: string; controls: string; fixes: Fix[]; session: boolean }
export interface RunResult { code: number; stdout: string; stderr: string }
export type ChatEvent =
  | { key: string; type: 'start' }
  | { key: string; type: 'text' | 'tool' | 'error'; text: string }
  | { key: string; type: 'result'; ok: boolean; text: string; denials: { tool: string; input: Record<string, unknown> }[] }
  | { key: string; type: 'end'; code: number; newGame: string | null; error: string; auth: boolean };

export interface StudioApi {
  checkEnv(): Promise<Env>;
  login(): Promise<void>;
  installClaude(): Promise<void>;
  games(): Promise<Game[]>;
  send(key: string, text: string, slug: string | null): Promise<void>;
  stop(key: string): Promise<void>;
  resetChat(key: string): Promise<void>;
  allow(rule: string): Promise<void>;
  applyFix(slug: string, n: number | 'all'): Promise<RunResult>;
  undoFix(slug: string, n: number | 'all'): Promise<RunResult>;
  exportGame(slug: string): Promise<RunResult>;
  openExternal(url: string): Promise<void>;
  openFolder(slug: string | null): Promise<void>;
  onChat(fn: (ev: ChatEvent) => void): void;
  onTools(fn: (status: string) => void): void;
  onGamesChanged(fn: () => void): void;
}

declare global { interface Window { studio?: StudioApi } }
export const studio = (): StudioApi | null => (typeof window !== 'undefined' ? window.studio ?? null : null);
export const NEW = '__new__';   // tab / chat key for "make a new game"
