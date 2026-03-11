"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { SSEEvent } from "@/lib/engine/types";

export function useSSE() {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/sse");
    sourceRef.current = source;

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    const eventTypes = [
      "task:created", "task:started", "task:progress",
      "task:completed", "task:failed", "task:cancelled",
      "approval:needed", "approval:resolved",
      "notification",
    ];

    for (const type of eventTypes) {
      source.addEventListener(type, (e) => {
        const event: SSEEvent = {
          type: type as SSEEvent["type"],
          data: JSON.parse((e as MessageEvent).data),
        };
        setEvents((prev) => [...prev.slice(-100), event]);
      });
    }

    return () => {
      source.close();
      setConnected(false);
    };
  }, []);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { events, connected, clearEvents };
}
