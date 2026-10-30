import { z } from 'zod';
import { route, readJson, principal } from '@/lib/api';
import { answer } from '@/lib/aira';

/** Streams NDJSON events: text chunks, then citations, then done. */
export const POST = route(async (req: Request) => {
  const { question } = z.object({ question: z.string().trim().min(2).max(500) }).parse(await readJson(req));
  const p = await principal();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of answer(p, question)) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      } catch (err) {
        console.error(err);
        controller.enqueue(encoder.encode(JSON.stringify({ type: 'text', text: "I couldn't answer that right now." }) + '\n'));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
});
