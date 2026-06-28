'use client'

type BarcodeError = 'not_found' | 'invalid' | 'unreachable'

export function ScanResultView({ barcodeLoading, barcodeError, onCustomFood, onRescan, onSearch }: {
  barcodeLoading: boolean
  barcodeError: BarcodeError | null
  onCustomFood: () => void
  onRescan: () => void
  onSearch: () => void
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 pb-10 px-5">
      {barcodeLoading ? (
        <>
          <div className="w-16 h-16 rounded-full border-4 border-orange-400 border-t-transparent animate-spin" />
          <p className="text-white/60 text-[16px]">Looking up product…</p>
        </>
      ) : barcodeError === 'not_found' ? (
        <>
          <p className="text-[36px]">🔍</p>
          <p className="text-white font-semibold text-[17px]">Product not found</p>
          <p className="text-white/40 text-[14px] text-center px-4">
            This product isn't in Open Food Facts.<br />Enter the details manually.
          </p>
          <div className="flex flex-col gap-2 w-full mt-2">
            <button onClick={onCustomFood}
              className="h-[48px] rounded-[14px] bg-white text-black font-semibold text-[15px]">
              Enter manually
            </button>
            <button onClick={onRescan}
              className="h-[48px] rounded-[14px] font-semibold text-[15px] text-teal-400"
              style={{ background: 'rgba(45,212,191,0.10)' }}>
              Scan again
            </button>
            <button onClick={onSearch} className="text-white/40 font-medium text-[14px] py-2">
              Search by name
            </button>
          </div>
        </>
      ) : barcodeError === 'unreachable' || barcodeError === 'invalid' ? (
        <>
          <p className="text-[36px]">{barcodeError === 'invalid' ? '📵' : '⚠️'}</p>
          <p className="text-white font-semibold text-[17px]">
            {barcodeError === 'invalid' ? 'Invalid barcode' : 'Connection error'}
          </p>
          <p className="text-white/40 text-[14px] text-center px-4">
            {barcodeError === 'invalid'
              ? 'Scan a valid product barcode (EAN-8, EAN-13, UPC).'
              : 'Open Food Facts is temporarily unavailable.'}
          </p>
          <div className="flex flex-col gap-2 w-full mt-2">
            <button onClick={onRescan}
              className="h-[48px] rounded-[14px] bg-white text-black font-semibold text-[15px]">
              Scan again
            </button>
            <button onClick={onCustomFood} className="text-white/40 font-medium text-[14px] py-2">
              Enter manually
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
