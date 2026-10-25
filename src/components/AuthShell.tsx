/** Sign-in pages (mockup): the form alone on a white page, centred on wider screens. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-surface md:min-h-0 md:py-10">{children}</div>;
}
