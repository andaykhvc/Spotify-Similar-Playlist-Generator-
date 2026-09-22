export default function LoadingSimilarPlaylist() {
  return (
    <div className="mx-auto max-w-3xl py-16" aria-busy="true">
      <div className="skeleton h-5 w-40 rounded" />
      <div className="skeleton mt-6 h-14 w-4/5 rounded-xl" />
      <div className="mt-10 space-y-3">
        {Array.from({ length: 8 }, (_, index) => <div key={index} className="skeleton h-20 rounded-2xl" />)}
      </div>
    </div>
  );
}
