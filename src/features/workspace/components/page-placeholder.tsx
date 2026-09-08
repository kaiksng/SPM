export function PagePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-2 text-sm">{description}</p>
      <div className="border-border mt-8 rounded-xl border border-dashed p-8 text-center">
        <p className="text-muted-foreground text-sm">
          This section isn&apos;t built yet — content will land here in a future
          story.
        </p>
      </div>
    </div>
  );
}
