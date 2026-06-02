export default function Loading() {
  return (
    <div className="min-h-screen px-5" style={{
      paddingTop: 'calc(env(safe-area-inset-top, 0px) + 18px)',
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 112px)',
    }}>
      <div className="mb-7 flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-32 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.07)' }} />
          <div className="h-10 w-20 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.07)' }} />
        </div>
      </div>
      <div className="flex flex-col gap-[22px]">
        <Sk className="h-[200px] rounded-3xl" />
        <Sk className="h-[100px] rounded-3xl" />
        <Sk className="h-6 w-40 rounded-lg" />
        <Sk className="h-[60px] rounded-[18px]" />
        <Sk className="h-[60px] rounded-[18px]" />
        <Sk className="h-[60px] rounded-[18px]" />
        <Sk className="h-[60px] rounded-[18px]" />
      </div>
    </div>
  )
}

function Sk({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse ${className}`} style={{ background: 'rgba(255,255,255,0.07)' }} />
}
