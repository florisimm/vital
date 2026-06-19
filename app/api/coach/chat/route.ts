import OpenAI from 'openai'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const SYSTEM = `You are a data-driven fitness coach. Only answer questions about training, recovery, sleep, nutrition, and health — otherwise decline in one short sentence. Answer in ONE sentence, max two if truly needed. Just the number or verdict — no intros, no filler, no follow-up questions. Always reply in the user's language.`

// Flatten Anthropic-style content blocks to a plain string for OpenAI
function toOpenAIMessages(msgs: { role: string; content: any }[]): { role: 'user' | 'assistant'; content: string }[] {
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

  const stream = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    max_tokens: 120,
    messages: [{ role: 'system', content: SYSTEM }, ...toOpenAIMessages(messages)],
    stream: true,
  })

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? ''
          if (text) controller.enqueue(enc.encode(text))
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
