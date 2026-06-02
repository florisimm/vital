import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  const { image } = await req.json() as { image: string }
  if (!image) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: image },
          },
          {
            type: 'text',
            text: `Identify this food item and estimate its nutritional values per 100g.
Return ONLY a JSON object in this exact format, no other text:
{
  "name": "Food name",
  "kcal": 150,
  "protein": 10.5,
  "carbs": 20.0,
  "fat": 5.0
}`,
          },
        ],
      },
    ],
  })

  try {
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Could not parse food data' }, { status: 422 })
  }
}
