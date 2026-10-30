import Anthropic from '@anthropic-ai/sdk';
import { retrieveForAira } from '@/lib/search';
import type { Principal } from '@/lib/policy/types';

export const NO_ANSWER = "I don't have approved information on that.";

export type AiraCitation = { n: number; title: string; url: string; kind: string };
export type AiraEvent = { type: 'text'; text: string } | { type: 'citations'; citations: AiraCitation[] } | { type: 'done'; mode: 'llm' | 'extractive' | 'none' };

const SYSTEM = `You are AIRA, the azentio.ai assistant. Answer ONLY from the numbered sources provided in the user message.
Cite every claim with its source number in square brackets, e.g. [1]. If the sources do not answer the question, reply exactly: "${NO_ANSWER}"
Never speculate beyond the sources, never present popularity as market prevalence or proof of causation, and keep answers under 120 words.`;

/**
 * Retrieval is filtered by the caller's audience partitions BEFORE ranking (AI-01/AI-03) and checks the
 * withdrawal blocklist on every query (AI-04). Only these permitted snippets ever reach the LLM provider (AI-05).
 */
export async function* answer(principal: Principal | null, question: string): AsyncGenerator<AiraEvent> {
  const docs = await retrieveForAira(principal, question, 4);
  if (docs.length === 0) {
    yield { type: 'text', text: NO_ANSWER };
    yield { type: 'citations', citations: [] };
    yield { type: 'done', mode: 'none' };
    return;
  }
  const citations: AiraCitation[] = docs.map((d, i) => ({ n: i + 1, title: d.title, url: d.url, kind: d.sourceType }));

  if (process.env.ANTHROPIC_API_KEY) {
    const sources = docs.map((d, i) => `[${i + 1}] ${d.title}\n${d.text.slice(0, 1500)}`).join('\n\n');
    let produced = false;
    try {
      const client = new Anthropic();
      const stream = client.beta.messages.stream({
        model: 'claude-opus-5-5',
        max_tokens: 2000,
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM,
        messages: [{ role: 'user', content: `Sources:\n${sources}\n\nQuestion: ${question}` }],
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          produced = true;
          yield { type: 'text', text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal' && !produced) yield { type: 'text', text: NO_ANSWER };
      yield { type: 'citations', citations };
      yield { type: 'done', mode: 'llm' };
      return;
    } catch (err) {
      if (produced) {
        yield { type: 'citations', citations };
        yield { type: 'done', mode: 'llm' };
        return;
      }
      console.error('AIRA provider error, falling back to extractive answer', err instanceof Anthropic.APIError ? err.status : err);
    }
  }

  // Extractive fallback: quote the best-matching sentence from each permitted source.
  const terms = (question.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).map((t) => t.slice(0, 6));
  const parts = docs.slice(0, 3).map((d, i) => {
    const sentences = d.text.split(/(?<=[.!?])\s+/);
    const best = sentences.map((s) => ({ s, score: terms.filter((t) => s.toLowerCase().includes(t)).length })).sort((a, b) => b.score - a.score)[0];
    return `${best.s.trim()} [${i + 1}]`;
  });
  const text = `From approved sources: ${parts.join(' ')}`;
  for (const chunk of text.match(/.{1,12}(\s|$)/g) ?? [text]) yield { type: 'text', text: chunk };
  yield { type: 'citations', citations: citations.slice(0, 3) };
  yield { type: 'done', mode: 'extractive' };
}
