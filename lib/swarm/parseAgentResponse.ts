// Parse structured JSON from swarm LLM replies (Anthropic or OpenAI-compatible).

export function parseAgentJsonFromLlmText(text: string): unknown {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/({[\s\S]*})/);
  try {
    return jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
