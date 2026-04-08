export default function PublicMenuLoading() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 px-6">
      <div
        className="h-10 w-10 rounded-full border-2 border-white/20 border-t-amber-400 animate-spin"
        aria-hidden
      />
      <p className="text-white/80 text-sm">Loading menu…</p>
    </div>
  )
}
