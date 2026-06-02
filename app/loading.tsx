export default function Loading() {
  return (
    <div className="min-h-screen px-5" style={{
      paddingTop: 'calc(env(safe-area-inset-top, 0px) + 18px)',
      paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 112px)',
    }}>
      <div className="mb-7 flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-3 w-24 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.07)' }} />
          <div className="h-10 w-36 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.07)' }} />
        </div>
      </div>
      <div className="flex flex-col gap-[22px]">
        <Sk className="h-[220px] rounded-[30px]" />
        <Sk className="h-5 w-32 rounded-lg" />
        <div className="grid grid-cols-2 gap-3">
          <Sk className="h-[130px] rounded-3xl" />
          <Sk className="h-[130px] rounded-3xl" />
        </div>
        <Sk className="h-[90px] rounded-3xl" />
        <Sk className="h-[110px] rounded-3xl" />
      </div>
    </div>
  )
}

function Sk({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse ${className}`} style={{ background: 'rgba(255,255,255,0.07)' }} />
}
