/**
 * MCP streamable HTTP endpoint — Mobius Terminal bridge (C-286).
 *
 * Client config (Cursor): `{ "mcpServers": { "mobius-terminal": { "url": "https://<host>/api/mcp" } } }`
 */

import { createMcpHandler } from 'mcp-handler';
import { registerMobiusTerminalMcpTools } from '@/lib/mcp/mobius-terminal-mcp';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const handler = createMcpHandler(
  async (server) => {
    registerMobiusTerminalMcpTools(server);
  },
  {
    serverInfo: {
      name: 'mobius-civic-ai-terminal',
      version: '1.0.0',
    },
  },
  {
    basePath: '/api',
    maxDuration: 60,
    verboseLogs: process.env.NODE_ENV === 'development',
  },
);

export { handler as GET, handler as POST, handler as DELETE };
