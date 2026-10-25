"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatPhone, normalizePhone, typePhone } from "@/lib/phone";

/**
 * Phone field that formats as you type: "34567890" → "+509 3456 7890". Haiti by default;
 * start with "+" and another country code for abroad (+1 809…). The server normalizes it again.
 */
export function PhoneInput({ id, name, defaultValue, className = "input", autoComplete = "tel", required }: { id: string; name: string; defaultValue?: string | null; className?: string; autoComplete?: string; required?: boolean }) {
  const t = useTranslations("phone");
  const [value, setValue] = useState(defaultValue ? formatPhone(defaultValue) : "");
  const [bad, setBad] = useState(false);
  return (
    <div>
      <input
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete={autoComplete}
        required={required}
        maxLength={22}
        placeholder="+509 3456 7890"
        value={value}
        aria-invalid={bad || undefined}
        aria-describedby={bad ? `${id}-bad` : undefined}
        onFocus={() => !value && setValue("+509 ")}
        onChange={(e) => {
          setBad(false);
          // Deleting: let the customer erase freely (no re-format fighting the backspace).
          const deleting = e.target.value.length < value.length;
          setValue(deleting ? e.target.value : typePhone(e.target.value));
        }}
        onBlur={() => {
          const v = value.trim();
          if (!v || v === "+509" || v === "+") return setValue("");
          const n = normalizePhone(v);
          if (n) setValue(formatPhone(n));
          else setBad(true);
        }}
        className={`${className} font-mono tracking-wide${bad ? " border-danger" : ""}`}
      />
      {bad && <p id={`${id}-bad`} className="mt-1.5 text-xs text-danger">{t("bad")}</p>}
    </div>
  );
}
