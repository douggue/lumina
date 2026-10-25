export function ContentPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="container-page max-w-3xl py-10 sm:py-14">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <div className="mt-6 space-y-4 text-[15px] leading-relaxed">{children}</div>
    </div>
  );
}
