import Image from "next/image";

/** Category image when uploaded, otherwise its emoji icon. */
export function CategoryIcon({ image, icon, size = 44 }: { image?: string | null; icon?: string | null; size?: number }) {
  return (
    <span className="relative grid shrink-0 place-items-center overflow-hidden rounded-xl bg-primary-soft text-xl" style={{ width: size, height: size }} aria-hidden>
      {image ? <Image src={image} alt="" fill sizes={`${size}px`} className="object-cover" /> : icon}
    </span>
  );
}
