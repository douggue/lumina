import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <div className="container-page grid min-h-[50vh] place-items-center py-16 text-center">
      <div className="max-w-md space-y-4">
        <p className="text-5xl font-extrabold text-primary">404</p>
        <h1 className="text-2xl font-bold tracking-tight">{t("notFoundTitle")}</h1>
        <p className="text-muted">{t("notFoundBody")}</p>
        <Link href="/store" className="btn-primary">{t("notFoundCta")}</Link>
      </div>
    </div>
  );
}
