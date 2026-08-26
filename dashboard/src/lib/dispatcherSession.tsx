import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getUser } from "./auth";

export type DispatchOperator = { id: string; displayName: string; active: boolean };

type DispatcherSessionValue = {
  operators: DispatchOperator[];
  selectedOperator: DispatchOperator | null;
  loading: boolean;
  selectorOpen: boolean;
  selectOperator: (operator: DispatchOperator) => void;
  openSelector: () => void;
  closeSelector: () => void;
  refreshOperators: () => Promise<void>;
  clearSelection: () => void;
};

const DispatcherSessionContext = createContext<DispatcherSessionValue | null>(null);

function storageKey() {
  const user = getUser();
  return `trackrunner.dispatcher-workspace.${user?.organizationId ?? "default"}`;
}

export function DispatcherSessionProvider({ children }: { children: ReactNode }) {
  const [operators, setOperators] = useState<DispatchOperator[]>([]);
  const [selectedOperator, setSelectedOperator] = useState<DispatchOperator | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectorOpen, setSelectorOpen] = useState(false);

  const refreshOperators = useCallback(async () => {
    const response = await api<{ operators: DispatchOperator[] }>("/api/dispatch-operators");
    setOperators(response.operators);
    setSelectedOperator((current) => {
      const stillActive = response.operators.find((operator) => operator.id === current?.id);
      if (stillActive) return stillActive;
      const raw = sessionStorage.getItem(storageKey());
      const restored = response.operators.find((operator) => operator.id === raw);
      if (restored) return restored;
      return null;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await refreshOperators();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [refreshOperators]);

  useEffect(() => {
    if (!loading && operators.length > 0 && !selectedOperator) setSelectorOpen(true);
  }, [loading, operators.length, selectedOperator]);

  const value = useMemo<DispatcherSessionValue>(() => ({
    operators,
    selectedOperator,
    loading,
    selectorOpen,
    selectOperator(operator) {
      sessionStorage.setItem(storageKey(), operator.id);
      setSelectedOperator(operator);
    },
    openSelector: () => setSelectorOpen(true),
    closeSelector: () => setSelectorOpen(false),
    refreshOperators,
    clearSelection() {
      sessionStorage.removeItem(storageKey());
      setSelectedOperator(null);
    },
  }), [operators, selectedOperator, loading, selectorOpen, refreshOperators]);

  return <DispatcherSessionContext.Provider value={value}>{children}</DispatcherSessionContext.Provider>;
}

export function useDispatcherSession() {
  const value = useContext(DispatcherSessionContext);
  if (!value) throw new Error("useDispatcherSession must be used inside DispatcherSessionProvider");
  return value;
}
