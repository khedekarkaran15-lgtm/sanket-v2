import React, { createContext, useContext, useState, useCallback } from "react";

interface Filters {
  brandFilter: string;
  attributeFilter: string | null;
}

interface SankETContextValue {
  filters: Filters;
  setFilters: (f: Filters) => void;
  savedTrends: string[];
  toggleSaved: (id: string) => void;
  dismissedTrends: string[];
  toggleDismissed: (id: string) => void;
}

const SankETContext = createContext<SankETContextValue>({
  filters: { brandFilter: "all", attributeFilter: null },
  setFilters: () => {},
  savedTrends: [],
  toggleSaved: () => {},
  dismissedTrends: [],
  toggleDismissed: () => {},
});

export const useSankET = () => useContext(SankETContext);

export const SankETProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [filters, setFilters] = useState<Filters>({ brandFilter: "all", attributeFilter: null });
  const [savedTrends, setSavedTrends] = useState<string[]>([]);
  const [dismissedTrends, setDismissedTrends] = useState<string[]>([]);

  const toggleSaved = useCallback((id: string) => {
    setSavedTrends((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  const toggleDismissed = useCallback((id: string) => {
    setDismissedTrends((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }, []);

  return (
    <SankETContext.Provider value={{ filters, setFilters, savedTrends, toggleSaved, dismissedTrends, toggleDismissed }}>
      {children}
    </SankETContext.Provider>
  );
};
