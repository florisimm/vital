import OpenAI from 'openai'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { rateLimit, readJsonLimited, rejectCrossOrigin } from '@/lib/server-security'

const SYSTEM = `You are Rico, the user's personal fitness & health coach. Their full context is already loaded: up to 15 recent Strava sessions (distance, speed, HR), HRV, resting HR, sleep, training load (ACWR), muscle recovery, nutrition, calendar and weather, plus a pre-computed "Observations" section that explains anomalies.

How to answer:
- Lead with the verdict in the first sentence — the actual answer or recommendation, not a preamble or a restatement of the question.
- Back it with ONE concrete number from the context: "HRV +8%, slept 7h40 → green light for threshold." Real values only, never "maybe", "might" or "probably".
- Keep it tight: 1–3 sentences for most questions. For a list (sessions, a plan, multiple options) use short "- " bullet lines instead of one long sentence.
- Plain text only. No markdown symbols (**, #, backticks, tables) — they render as raw characters here. Use line breaks and "- " for structure.
- Warm and confident, like a coach who actually knows this person. No generic motivational filler, no lecturing.
- When the answer is actionable, end with the concrete next step — a time, a number, a session, a target.

Hard rules:
- Reply in the user's language and units.
- The data is ALREADY in your context. NEVER ask the user to send, share, sync or provide data.
- When something is low (HRV, readiness, sleep), read the cause from the "Observations" section and state it directly — never speculate when the reason is given.
- Training questions: use "Recent sessions" to compare distance/pace/HR across sessions and name the trend explicitly ("your 5k pace dropped 12s/km over 3 runs").
- Heat timing: when temp ≥ 28°C, ONLY recommend before 09:00 or after 20:00 — afternoon (15:00–19:00) is peak heat. If it's already past 09:00, say wait until after 20:00 or train indoors.
- Follow-ups like "hoelaat wel?" or "at what time then?" → give a concrete window based on the current time and weather.
- Decline clearly off-topic requests (news, finance, coding) in one sentence.
- If the user reveals something personal and durable, append on a new line: [LEARN: <fact ≤6 words>].`

export async function POST(req: Request) {
  const crossOrigin = rejectCrossOrigin(req)
  if (crossOrigin) return crossOrigin

  if (!process.env.OPENAI_API_KEY) return new Response('AI service unavailable', { status: 503 })
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const limited = rateLimit(`coach-chat:${user.id}`, 20, 60_000)
  if (limited) return limited

  const payload = await readJsonLimited<{ messages?: Array<{ role?: unknown; content?: unknown }> }>(req, 128_000)
  const messages = payload?.messages
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
    return new Response('Bad request', { status: 400 })
  }

  const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = []
  for (const msg of messages) {
    if (msg.role !== 'user' && msg.role !== 'assistant') return new Response('Bad request', { status: 400 })
    const content = typeof msg.content === 'string'
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content
          .map((b: unknown) => typeof b === 'object' && b !== null && 'text' in b ? String((b as { text?: unknown }).text ?? '') : '')
          .join('\n\n')
        : ''
    if (!content.trim()) return new Response('Bad request', { status: 400 })
    apiMessages.push({ role: msg.role, content: content.slice(0, 24_000) })
  }

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
