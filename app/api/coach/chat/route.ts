import OpenAI from 'openai'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const SYSTEM = `You are Rico, a data-driven AI fitness coach. You have access to the user's complete health data — HRV, sleep, training load, recovery, nutrition, and weather.

Rules:
- Only answer questions about training, recovery, sleep, nutrition, and health. Decline anything else in one sentence.
- Always reply in the user's language.
- Keep replies short: 1–3 sentences max.
- When you notice something unusual (low HRV, poor recovery, low sleep score), look at the "Observations" section in the context. It has pre-computed reasons. Use them to explain WHY, not just what.
- When recommending something, briefly state the data that supports it (e.g. "HRV is above baseline and you slept 7h45m — green light for a threshold session").
- Ask one short follow-up question only when genuinely needed to give better advice.
- No intros, no filler, no bullet lists unless truly helpful.
- If the user reveals something personal and durable (e.g. "I handle heat well", "I train best in the morning", "I'm lactose intolerant"), output on a new line at the very end: [LEARN: <fact in ≤6 words>]. Only one tag per reply, only for genuinely new facts.`

function toInput(msgs: { role: string; content: any }[]): { role: 'user' | 'assistant'; content: string }[] {
  return msgs.map(msg => {
    const content = typeof msg.content === 'string'
      ? msg.content
      : (msg.content as { text?: string }[]).map(b => b.text ?? '').join('\n\n')
    return { role: msg.role as 'user' | 'assistant', content }
  })
}

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) return new Response('OPENAI_API_KEY not configured', { status: 503 })
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages } = await req.json()

  let stream: any
  try {
    stream = await openai.responses.create({
      model: 'gpt-5-mini',
      instructions: SYSTEM,
      max_output_tokens: 160,
      input: toInput(messages),
      stream: true,
    })
  } catch (err: any) {
    const msg = err?.message ?? String(err)
    console.error('[coach/chat] OpenAI error:', msg)
    return new Response(`OpenAI error: ${msg}`, { status: 502 })
  }

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      try {
        for await (const event of stream) {
          if (event.type === 'response.output_text.delta') {
            controller.enqueue(enc.encode(event.delta))
          }
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
