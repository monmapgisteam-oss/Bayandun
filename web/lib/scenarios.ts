// Хувилбарын сан (localStorage) — модулиудын үр дүнг Модуль 9-д харьцуулна
export type Scenario = {
  id: string;
  module: number;
  name: string;
  created: string;
  metrics: Record<string, number | string>;
  params?: Record<string, unknown>;
};

const KEY = "booroljuulelt:scenarios";
const subs = new Set<() => void>();

export function loadScenarios(): Scenario[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

function save(list: Scenario[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
  subs.forEach((f) => f());
}

export function addScenario(s: Omit<Scenario, "id" | "created">) {
  const list = loadScenarios();
  list.push({ ...s, id: Math.random().toString(36).slice(2, 9), created: new Date().toISOString() });
  save(list);
}

export const removeScenario = (id: string) => save(loadScenarios().filter((s) => s.id !== id));
export const subscribeScenarios = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
