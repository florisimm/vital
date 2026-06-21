import OpenAI from 'openai'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const SYSTEM = `You are Rico, a data-driven fitness coach. You have the user's full Strava history (up to 15 recent sessions with distance, speed, HR), HRV, sleep, training load, nutrition, and weather in your context.

Rules:
- Be short and direct. 1–2 sentences. No intros, no filler.
- Always reply in the user's language.
- Use the data in your context immediately. NEVER ask the user to send or provide data — it is already there.
- For training analysis (cycling, running, strength): use the "Recent sessions" section. Compare distances, speeds, HR across sessions to identify trends.
- When something is low (HRV, recovery), check the "Observations" section for the pre-computed reason. State it directly.
- Back recommendations with a data point: "HRV +8%, slept 7h40 → green light for threshold."
- Decline only clearly off-topic requests (news, finance, coding) in one sentence.
- If the user reveals something personal and durable, append on a new line: [LEARN: <fact ≤6 words>].`

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
      max_output_tokens: 700,
      reasoning: { effort: 'minimal' },
      text: { verbosity: 'low' },
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
