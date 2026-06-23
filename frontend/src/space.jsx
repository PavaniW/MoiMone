import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './lib/api.js';

const SpaceContext = createContext(null);
const STORAGE_KEY = 'moimone.currentSpaceId';

// Tracks the spaces the user belongs to and which one is "active". The active
// space scopes every data page (one space at a time) and is where new entries
// are written. Defaults to the personal space; remembered across reloads.
export function SpaceProvider({ children }) {
  const [spaces, setSpaces] = useState([]);
  const [currentSpaceId, setCurrentSpaceId] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await api.getSpaces();
    setSpaces(list);
    setCurrentSpaceId((prev) => {
      // Keep the current selection if it still exists; else stored; else personal.
      const stored = localStorage.getItem(STORAGE_KEY);
      const ids = list.map((s) => s.id);
      const personal = list.find((s) => s.kind === 'personal')?.id || list[0]?.id || null;
      if (prev && ids.includes(prev)) return prev;
      if (stored && ids.includes(stored)) return stored;
      return personal;
    });
    return list;
  }, []);

  useEffect(() => {
    let active = true;
    refresh()
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [refresh]);

  const selectSpace = useCallback((id) => {
    setCurrentSpaceId(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const currentSpace = spaces.find((s) => s.id === currentSpaceId) || null;

  return (
    <SpaceContext.Provider
      value={{ spaces, currentSpaceId, currentSpace, selectSpace, refresh, loading }}
    >
      {children}
    </SpaceContext.Provider>
  );
}

export function useSpace() {
  const ctx = useContext(SpaceContext);
  if (!ctx) throw new Error('useSpace must be used within SpaceProvider');
  return ctx;
}
