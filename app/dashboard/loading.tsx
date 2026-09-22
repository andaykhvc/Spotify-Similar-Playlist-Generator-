export default function DashboardLoading() {
  return (
    <div className="py-10 sm:py-14" aria-label="Çalma listeleri yükleniyor">
      <div className="skeleton h-6 w-36 rounded-full" />
      <div className="skeleton mt-5 h-14 w-full max-w-xl rounded-2xl" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="surface rounded-3xl p-4">
            <div className="skeleton aspect-square rounded-2xl" />
            <div className="skeleton mt-4 h-5 w-3/4 rounded" />
            <div className="skeleton mt-3 h-4 w-1/2 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
