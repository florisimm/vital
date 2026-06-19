import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM = `You are a data-driven fitness coach. Only answer questions about training, recovery, sleep, nutrition, and health — otherwise decline in one short sentence. Answer in ONE sentence, max two if truly needed. Just the number or verdict — no intros, no filler, no follow-up questions. Always reply in the user's language.`

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return new Response('ANTHROPIC_API_KEY not configured', { status: 503 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages } = await req.json() as { messages: Anthropic.MessageParam[] }

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 120,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages,
  })

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(enc.encode(event.delta.text))
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
