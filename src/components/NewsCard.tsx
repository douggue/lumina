import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { formatDate, t } from "@/lib/text";

type Article = { slug: string; title: unknown; excerpt: unknown; image: string | null; publishedAt: Date | null };

export function NewsCard({ article, locale }: { article: Article; locale: string }) {
  return (
    <Link href={`/news/${article.slug}`} className="card lift flex flex-col overflow-hidden">
      {article.image ? (
        <div className="ds-hide relative aspect-[16/9] bg-surface-2">
          <Image src={article.image} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
        </div>
      ) : (
        <div className="ds-hide aspect-[16/9] bg-gradient-to-br from-primary to-navy" aria-hidden />
      )}
      <div className="flex flex-1 flex-col p-4">
        {article.publishedAt && (
          <time className="text-xs text-muted" dateTime={article.publishedAt.toISOString()}>
            {formatDate(article.publishedAt, locale)}
          </time>
        )}
        <h3 className="mt-1 font-semibold leading-snug">{t(article.title, locale)}</h3>
        <p className="mt-1 line-clamp-3 text-sm text-muted">{t(article.excerpt, locale)}</p>
      </div>
    </Link>
  );
}
