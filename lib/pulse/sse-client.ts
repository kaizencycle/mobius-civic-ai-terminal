/**
 * Pulse SSE Client for real-time terminal data streaming
 * Replaces polling-based updates with Server-Sent Events
 * Fallback to polling if SSE connection fails
 */

export type PulseChannel = 'epicon' | 'gi' | 'agents' | 'tripwires' | 'journal' | 'integrity';

export type SSEEventHandler<T> = (data: T) => void;

export class PulseSSEClient {
  private eventSource: EventSource | null = null;
  private callbacks: Map<string, Set<SSEEventHandler<any>>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000;
  private isConnected = false;

  connect(endpoint: string, channels: PulseChannel[] = ['epicon', 'gi', 'agents']) {
    if (typeof window === 'undefined') {
      console.warn('[pulse-sse] SSR environment - skipping SSE connection');
      return;
    }

    // Close existing connection if any
    this.disconnect();

    const url = `${endpoint}?channels=${channels.join(',')}`;
    console.log('[pulse-sse] connecting to', url);

    try {
      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log('[pulse-sse] connected');
        // Notify all callbacks of connection status
        this.notifyConnectionStatus(true);
      };

      this.eventSource.addEventListener('pulse-update', (e) => {
        try {
          const update = JSON.parse(e.data);
          const channel = update.channel as string;
          const payload = update.payload;

          if (this.callbacks.has(channel)) {
            this.callbacks.get(channel)!.forEach(cb => {
              try {
                cb(payload);
              } catch (err) {
                console.error('[pulse-sse] callback error for channel', channel, err);
              }
            });
          }
        } catch (err) {
          console.error('[pulse-sse] failed to parse event data', e.data, err);
        }
      });

      this.eventSource.addEventListener('connected', (e) => {
        try {
          const data = JSON.parse(e.data);
          console.log('[pulse-sse] server ack', data);
        } catch {
          // Ignore parse errors for connection ack
        }
      });

      this.eventSource.onerror = (err) => {
        console.warn('[pulse-sse] connection error, attempting reconnect...', err);
        this.isConnected = false;
        this.notifyConnectionStatus(false);

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = this.reconnectDelay * this.reconnectAttempts;
          console.log(`[pulse-sse] reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
          
          setTimeout(() => {
            this.connect(endpoint, channels);
          }, delay);
        } else {
          console.error('[pulse-sse] max reconnect attempts reached, falling back to polling');
          this.disconnect();
        }
      };
    } catch (err) {
      console.error('[pulse-sse] failed to create EventSource', err);
    }
  }

  subscribe<T>(channel: PulseChannel, cb: SSEEventHandler<T>): () => void {
    if (!this.callbacks.has(channel)) {
      this.callbacks.set(channel, new Set());
    }
    const set = this.callbacks.get(channel)!;
    set.add(cb);

    // Return unsubscribe function
    return () => {
      set.delete(cb);
      // Clean up empty sets
      if (set.size === 0) {
        this.callbacks.delete(channel);
      }
    };
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.isConnected = false;
      this.notifyConnectionStatus(false);
    }
    this.callbacks.clear();
    this.reconnectAttempts = 0;
  }

  getConnectionState(): 'connecting' | 'connected' | 'closed' | 'error' {
    if (!this.eventSource) return 'closed';
    switch (this.eventSource.readyState) {
      case EventSource.CONNECTING: return 'connecting';
      case EventSource.OPEN: return 'connected';
      case EventSource.CLOSED: return 'closed';
      default: return 'error';
    }
  }

  isReady(): boolean {
    return this.isConnected && this.eventSource?.readyState === EventSource.OPEN;
  }

  private notifyConnectionStatus(connected: boolean) {
    // Could emit a special event for connection status changes
    // For now, just update internal state
    console.log('[pulse-sse] connection status changed:', connected ? 'connected' : 'disconnected');
  }
}

// Singleton instance for app-wide reuse
let _sseClient: PulseSSEClient | null = null;

export function getPulseSSEClient(): PulseSSEClient {
  if (!_sseClient) {
    _sseClient = new PulseSSEClient();
  }
  return _sseClient;
}
