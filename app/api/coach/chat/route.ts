import Anthropic from '@anthropic-ai/sdk'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM = `You are a data-driven fitness and health coach. You analyse the user's biometric data, training load, sleep, and nutrition and give concise, evidence-based advice. Be direct and specific — no generic tips. Always refer to the actual numbers in the data. Keep answers under 150 words unless the question genuinely requires more.`

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return new Response('ANTHROPIC_API_KEY not configured', { status: 503 })

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages } = await req.json() as { messages: Anthropic.MessageParam[] }

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages,
  })

  const readable = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      try {
        for await (const text of stream.textStream) {
          controller.enqueue(enc.encode(text))
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
