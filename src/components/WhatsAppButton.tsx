import { getTranslations } from "next-intl/server";
import { WhatsAppIcon } from "./Icons";

export async function WhatsAppButton({ number, message }: { number: string; message?: string }) {
  const t = await getTranslations("common");
  const text = encodeURIComponent(message ?? t("whatsappMessage"));
  return (
    <a
      href={`https://wa.me/${number}?text=${text}`}
      target="_blank"
      rel="noopener"
      style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}
      className="kb-hide fixed right-[18px] z-30 grid h-14 w-14 place-items-center rounded-full bg-[#15803D] text-white shadow-[0_6px_16px_rgba(21,128,61,0.35)] hover:bg-[#166534] md:!bottom-6 md:right-6"
      aria-label={t("whatsappHelp")}
    >
      <WhatsAppIcon width={26} height={26} />
    </a>
  );
}
