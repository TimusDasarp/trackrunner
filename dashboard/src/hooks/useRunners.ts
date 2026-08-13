import { useEffect, useState, useCallback } from "react";
import { getSocket } from "../lib/socket";
import { api } from "../lib/auth";
import type { LocationUpdate, RunnerState } from "../lib/types";

export function useRunners() {
  const [runners, setRunners] = useState<Record<string, RunnerState>>({});
  const [connected, setConnected] = useState(false);

  const upsert = useCallback((p: LocationUpdate) => {
    setRunners((prev) => ({
      ...prev,
      [p.runnerId]: {
        ...prev[p.runnerId],
        ...p,
        displayName: prev[p.runnerId]?.displayName ?? `Runner ${p.runnerId}`,
        email: prev[p.runnerId]?.email ?? "",
        online: true,
        trackingActive: true,
        status: "live",
        hasLocation: true,
      },
    }));
  }, []);

  const setOffline = useCallback((runnerId: string) => {
    setRunners((prev) =>
      prev[runnerId]
        ? { ...prev, [runnerId]: { ...prev[runnerId], online: false, status: prev[runnerId].trackingActive ? "stale" : "offline" } }
        : prev
    );
  }, []);

  const setTrackingStatus = useCallback((payload: { runnerId: string; trackingActive: boolean }) => {
    setRunners((prev) => {
      const runner = prev[payload.runnerId];
      if (!runner) return prev;
      return {
        ...prev,
        [payload.runnerId]: {
          ...runner,
          trackingActive: payload.trackingActive,
          status: payload.trackingActive ? "stale" : (runner.online ? "idle" : "offline"),
        },
      };
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await api<{ runners: RunnerState[] }>("/api/runners");
      setRunners(
        response.runners.reduce<Record<string, RunnerState>>((acc, runner) => {
          acc[runner.runnerId] = runner;
          return acc;
        }, {})
      );
    } catch (error) {
      console.warn("Failed to load runners:", error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadInitialRunners = async () => {
      try {
        const response = await api<{ runners: RunnerState[] }>("/api/runners");
        if (!mounted) return;
        setRunners(
          response.runners.reduce<Record<string, RunnerState>>((acc, runner) => {
            acc[runner.runnerId] = runner;
            return acc;
          }, {})
        );
      } catch (error) {
        console.warn("Failed to load initial runners:", error);
      }
    };

    loadInitialRunners();

    const s = getSocket();
    const onConnect = () => {
      setConnected(true);
      void refresh();
    };
    const onDisconnect = () => setConnected(false);
    const onLocation = (p: LocationUpdate) => upsert(p);
    const onOffline = (p: { runnerId: string }) => setOffline(p.runnerId);
    const onTrackingStatus = (p: { runnerId: string; trackingActive: boolean }) => setTrackingStatus(p);

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on("runner:location", onLocation);
    s.on("runner:offline", onOffline);
    s.on("runner:status", onTrackingStatus);

    if (s.connected) setConnected(true);

    return () => {
      mounted = false;
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("runner:location", onLocation);
      s.off("runner:offline", onOffline);
      s.off("runner:status", onTrackingStatus);
    };
  }, [upsert, setOffline, setTrackingStatus, refresh]);

  return { runners, connected, refresh };
}
