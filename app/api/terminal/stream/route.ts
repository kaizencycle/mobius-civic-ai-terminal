/**
 * Terminal Stream API - Server-Sent Events endpoint for real-time Pulse data
 * Replaces polling with streaming updates for EPICON, GI, agents, and tripwires
 */

import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

// Channel types supported by the stream
const VALID_CHANNELS = ['epicon', 'gi', 'agents', 'tripwires', 'journal', 'integrity'] as const;
type Channel = typeof VALID_CHANNELS[number];

interface StreamUpdate {
  channel: string;
  payload: any;
  timestamp: number;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channelsParam = searchParams.get('channels');
  const requestedChannels = channelsParam
    ? channelsParam.split(',').filter((c): c is Channel => VALID_CHANNELS.includes(c as Channel))
    : ['epicon', 'gi'];

  console.log('[terminal-stream] SSE connection requested for channels:', requestedChannels);

  const encoder = new TextEncoder();
  
  // Create SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection acknowledgment
      const connectedMsg: StreamUpdate = {
        channel: 'system',
        payload: { type: 'connected', channels: requestedChannels, ts: Date.now() },
        timestamp: Date.now(),
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(connectedMsg)}\n\n`));

      // Set up interval to push periodic updates
      // In production, this would subscribe to actual event sources (Redis pub/sub, Kafka, etc.)
      const updateInterval = setInterval(() => {
        // For now, send heartbeat to keep connection alive
        // Real implementation would fetch latest data from each channel
        const heartbeat: StreamUpdate = {
          channel: 'system',
          payload: { type: 'heartbeat', ts: Date.now() },
          timestamp: Date.now(),
        };
        
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(heartbeat)}\n\n`));
        } catch (err) {
          console.error('[terminal-stream] failed to send heartbeat', err);
          clearInterval(updateInterval);
          controller.close();
        }
      }, 30000); // Heartbeat every 30s

      // Cleanup on client disconnect
      req.signal.addEventListener('abort', () => {
        console.log('[terminal-stream] client disconnected');
        clearInterval(updateInterval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering on Vercel
      'Access-Control-Allow-Origin': '*',
    },
  });
}
