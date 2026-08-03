/**
 * One titled block inside a settings panel.
 *
 * Shared rather than repeated per panel so the heading, the description, and the
 * separator stay identical everywhere — a settings page whose sections are
 * subtly different heights reads as several pages stitched together.
 */
export function Section({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-3 border-b border-border py-6 first:pt-0 last:border-b-0">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && (
          <p className="mt-0.5 text-2xs text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}
