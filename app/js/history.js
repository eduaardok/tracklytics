const KEY = 'tl_history';
const MAX = 50;

export function getHistory() {
  return JSON.parse(localStorage.getItem(KEY) || '[]');
}

export function addToHistory(track) {
  const all = getHistory();
  all.unshift({ track, played_at: new Date().toISOString() });
  if (all.length > MAX) all.length = MAX;
  localStorage.setItem(KEY, JSON.stringify(all));
}
