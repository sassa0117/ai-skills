import type { SSEEvent } from "@/lib/engine/types";

type SendFunction = (event: SSEEvent) => void;

class SSEManager {
  private clients: Map<string, SendFunction> = new Map();

  addClient(id: string, send: SendFunction) {
    this.clients.set(id, send);
  }

  removeClient(id: string) {
    this.clients.delete(id);
  }

  broadcast(event: SSEEvent) {
    for (const send of this.clients.values()) {
      try {
        send(event);
      } catch {
        // Client disconnected, will be cleaned up
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

// Singleton
const globalForSSE = globalThis as unknown as {
  sseManager: SSEManager | undefined;
};

export const sseManager = globalForSSE.sseManager ?? new SSEManager();

if (process.env.NODE_ENV !== "production") globalForSSE.sseManager = sseManager;
