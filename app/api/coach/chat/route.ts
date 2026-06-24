import OpenAI from 'openai'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const SYSTEM = `You are Rico, a data-driven fitness coach. You have the user's full Strava history (up to 15 recent sessions with distance, speed, HR), HRV, sleep, training load, nutrition, and weather in your context.

Rules:
- Be short and direct. 1–3 sentences. No intros, no filler.
- Always reply in the user's language.
- Use the data in your context immediately. NEVER ask the user to send or provide data — it is already there.
- For training analysis (cycling, running, strength): use the "Recent sessions" section. Compare distances, speeds, HR across sessions to identify trends.
- When something is low (HRV, recovery), check the "Observations" section for the pre-computed reason. State it directly.
- Back recommendations with a data point: "HRV +8%, slept 7h40 → green light for threshold."
- When the user asks a follow-up like "at what time then?" or "hoelaat wel?" — give a concrete time recommendation based on the weather context (e.g. before 09:00 or after 19:00 when it's cooler).
- Decline only clearly off-topic requests (news, finance, coding) in one sentence.
- If the user reveals something personal and durable, append on a new line: [LEARN: <fact ≤6 words>].`

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) return new Response('OPENAI_API_KEY not configured', { status: 503 })
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages } = await req.json()

  const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = messages.map((msg: { role: string; content: any }) => {
    const content = typeof msg.content === 'string'
      ? msg.content
      : (msg.content as { text?: string }[]).map((b: { text?: string }) => b.text ?? '').join('\n\n')
    return { role: msg.role as 'user' | 'assistant', content }
  })

  let stream: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>
  try {
    stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: SYSTEM }, ...apiMessages],
      max_tokens: 300,
      stream: true,
    })
  } catch (err: any) {
    console.error('[coach/chat] OpenAI error:', err?.message ?? String(err))
    return new Response('AI service temporarily unavailable', { status: 502 })
  }

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content
          if (delta) controller.enqueue(enc.encode(delta))
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
