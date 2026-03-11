import { NextRequest } from "next/server";
import { sseManager } from "@/lib/sse/event-emitter";
import type { SSEEvent } from "@/lib/engine/types";

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const clientId = crypto.randomUUID();

      const send = (event: SSEEvent) => {
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`
            )
          );
        } catch {
          sseManager.removeClient(clientId);
        }
      };

      sseManager.addClient(clientId, send);

      // Send heartbeat every 30 seconds to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(
            encoder.encode(
              `event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`
            )
          );
        } catch {
          clearInterval(heartbeatInterval);
          sseManager.removeClient(clientId);
        }
      }, 30000);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeatInterval);
        sseManager.removeClient(clientId);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
