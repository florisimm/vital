import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '72px 80px',
          background: 'rgb(5, 6, 8)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Teal radial top-right */}
        <div style={{
          position: 'absolute', top: 0, right: 0,
          width: '700px', height: '500px',
          background: 'radial-gradient(circle at 100% 0%, rgba(0,210,220,0.25) 0%, transparent 60%)',
        }} />
        {/* Orange radial bottom-left */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0,
          width: '600px', height: '400px',
          background: 'radial-gradient(circle at 0% 100%, rgba(255,120,0,0.15) 0%, transparent 60%)',
        }} />

        {/* App name */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative' }}>
          <span style={{
            fontSize: '28px', fontWeight: 600, letterSpacing: '0.18em',
            color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
          }}>
            Vital
          </span>
          <span style={{
            fontSize: '72px', fontWeight: 800, lineHeight: 1.05,
            color: 'white',
          }}>
            AI Fitness &{'\n'}Health Coaching
          </span>
          <span style={{
            fontSize: '26px', fontWeight: 400,
            color: 'rgba(255,255,255,0.45)', marginTop: '8px',
          }}>
            Training · Nutrition · Recovery
          </span>
        </div>

        {/* Teal accent dot */}
        <div style={{
          position: 'absolute', top: '72px', left: '80px',
          width: '10px', height: '10px', borderRadius: '50%',
          background: 'rgb(45,212,191)',
        }} />
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
