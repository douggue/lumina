import { Flag } from "./Flags";

const HAITI = /(Ha[iïí]t[iíï]|Ayiti)/i;

/**
 * Hero label ("Fèt an Ayiti, pou jwè yo"): small Haiti flag instead of a dot, and the word Haiti / Ayiti / Haïti / Haití
 * in the flag's blue and red. Any text from Admin → Homepage works; without that word it's simply shown as is.
 */
export function HaitiEyebrow({ text }: { text: string }) {
  const parts = text.split(HAITI);
  return (
    <p className="animate-rise relative inline-flex items-center gap-2.5 self-start overflow-hidden rounded-full border border-white/15 bg-[linear-gradient(90deg,rgba(0,32,159,.45),rgba(10,20,50,.35)_55%,rgba(210,16,52,.3))] py-1.5 pl-1.5 pr-4 text-xs font-bold uppercase tracking-wider text-[#c9d6f2] shadow-[0_8px_30px_-12px_rgba(210,16,52,.45)] backdrop-blur">
      <span className="relative grid place-items-center">
        <span className="absolute h-6 w-6 animate-ping rounded-full bg-[#D21034]/30 motion-reduce:hidden" aria-hidden />
        <Flag locale="ht" size={22} className="relative ring-2 ring-white/70" />
      </span>
      <span>
        {parts.map((p, i) =>
          HAITI.test(p) && i % 2 === 1 ? (
            <span key={i} className="bg-[linear-gradient(180deg,#6b93ff_0%,#6b93ff_57%,#ff4d6a_57%,#ff4d6a_100%)] bg-clip-text font-extrabold text-transparent [text-shadow:none]">
              {p}
            </span>
          ) : (
            p
          ),
        )}
      </span>
    </p>
  );
}
