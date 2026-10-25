const LOCALES = [
  ["ht", "Kreyòl"],
  ["fr", "Français"],
] as const;

/** One input per language (Kreyòl, French) named `${prefix}_${locale}`. */
export function LocalizedInputs({ prefix, label, value = {}, textarea = false, required = false }: { prefix: string; label: string; value?: Record<string, string>; textarea?: boolean; required?: boolean }) {
  return (
    <fieldset className="space-y-2">
      <legend className="label">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {LOCALES.map(([code, name]) => (
          <label key={code} className="block">
            <span className="mb-1 block text-xs text-muted">{name}</span>
            {textarea ? (
              <textarea name={`${prefix}_${code}`} defaultValue={value[code] ?? ""} rows={3} className="input py-2" required={required && code === "ht"} />
            ) : (
              <input name={`${prefix}_${code}`} defaultValue={value[code] ?? ""} className="input" required={required && code === "ht"} />
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
