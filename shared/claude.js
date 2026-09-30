// Calls the Anthropic Messages API (streaming) and returns the files Claude writes.

import { HttpError } from './http.js';

const API = 'https://api.anthropic.com/v1/messages';
export const DEFAULT_MODEL = 'claude-sonnet-5-5';

const WRITE_FILES_TOOL = {
  name: 'write_files',
  description: 'Write the COMPLETE set of project files. Every call replaces the whole project, so include every file in full, including ones you did not change.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'One or two plain-English sentences telling the user what you built or changed.' },
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative file path, e.g. index.html or css/styles.css' },
            content: { type: 'string', description: 'Full file contents' },
          },
          required: ['path', 'content'],
        },
      },
    },
    required: ['summary', 'files'],
  },
};

/**
 * Streams a generation. onProgress(chars) is called as tool input arrives.
 * Returns { summary, files: [{path, content}], usage }.
 */
export async function generateFiles(env, { system, messages, onProgress = () => {} }) {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'The AI builder is not configured yet (missing ANTHROPIC_API_KEY).');

  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.CLAUDE_MODEL || DEFAULT_MODEL,
      max_tokens: Number(env.CLAUDE_MAX_TOKENS || 32000),
      stream: true,
      system,
      messages,
      tools: [WRITE_FILES_TOOL],
      tool_choice: { type: 'tool', name: 'write_files' },
    }),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    console.error('Anthropic error', res.status, text.slice(0, 500));
    if (res.status === 429 || res.status === 529) throw new HttpError(503, 'The AI is busy right now. Please try again in a minute.');
    if (res.status === 401) throw new HttpError(503, 'The AI builder key is invalid. Check ANTHROPIC_API_KEY.');
    throw new HttpError(502, 'The AI service returned an error. Please try again.');
  }

  let json = '';
  let stopReason = null;
  const usage = { input_tokens: 0, output_tokens: 0 };
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const event = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLine = event.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      let data;
      try { data = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
      if (data.type === 'content_block_delta' && data.delta?.type === 'input_json_delta') {
        json += data.delta.partial_json;
        onProgress(json.length);
      } else if (data.type === 'message_start') {
        usage.input_tokens = data.message?.usage?.input_tokens || 0;
      } else if (data.type === 'message_delta') {
        stopReason = data.delta?.stop_reason || stopReason;
        usage.output_tokens = data.usage?.output_tokens || usage.output_tokens;
      } else if (data.type === 'error') {
        throw new HttpError(502, data.error?.type === 'overloaded_error'
          ? 'The AI is busy right now. Please try again in a minute.'
          : 'The AI service returned an error. Please try again.');
      }
    }
  }

  if (stopReason === 'max_tokens') throw new HttpError(422, 'That project got too big for one step. Try asking for a smaller change.');
  let input;
  try { input = JSON.parse(json); } catch { throw new HttpError(502, 'The AI returned an incomplete result. Please try again.'); }
  return { summary: String(input.summary || 'Updated your project.'), files: input.files, usage };
}
