export default function PlaylistLoading() {
  return (
    <div className="py-10 sm:py-14" aria-label="Çalma listesi yükleniyor">
      <div className="surface rounded-[2rem] p-5 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="skeleton size-40 rounded-2xl" />
          <div className="flex-1 py-3">
            <div className="skeleton h-4 w-24 rounded" />
            <div className="skeleton mt-5 h-10 max-w-md rounded" />
            <div className="skeleton mt-4 h-5 w-52 rounded" />
          </div>
        </div>
      </div>
      <div className="mt-8 space-y-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="skeleton h-20 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
