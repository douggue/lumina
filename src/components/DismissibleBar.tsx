"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CloseIcon } from "./Icons";

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}

export function DismissibleBar({ id, text, link }: { id: string; text: string; link: string }) {
  const tc = useTranslations("common");
  const key = `hv_ann_${hash(id)}`;
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(key)) setHidden(true);
    } catch {}
  }, [key]);
  if (hidden) return null;
  const inner = <span className="font-medium">{text}</span>;
  return (
    <div className="relative bg-navy px-10 py-2 text-center text-sm text-white" data-announcement>
      {link ? <a href={link} className="underline-offset-4 hover:underline">{inner}</a> : inner}
      <button
        type="button"
        aria-label={tc("close")}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 opacity-80 hover:opacity-100"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(key, "1");
          } catch {}
        }}
      >
        <CloseIcon width={16} height={16} />
      </button>
    </div>
  );
}
