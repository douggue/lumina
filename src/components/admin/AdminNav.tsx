"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { AdminIcon } from "./AdminIcons";
import { MenuIcon, CloseIcon, HomeIcon, CartIcon, WalletIcon, ChatIcon, StoreIcon, UserIcon } from "../Icons";

/** Light/dark for the back office, remembered separately from the store. */
function useAdminTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
    try {
      localStorage.setItem("hv_admin_theme", next ? "dark" : "light");
    } catch {}
  };
  return { dark, toggle };
}

const footerBtn = "group flex flex-1 flex-col items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2 py-2.5 text-[11px] font-semibold text-[#CBD5E1] transition-colors hover:border-white/30 hover:text-white";

/** Mockup logo: blue tile with the rising arrow, "HaitiViral" with the red "Viral", and an ADMIN tag. */
function AdminLogo() {
  return (
    <span className="flex items-center gap-2 px-2">
      <span className="grid h-[30px] w-[30px] place-items-center rounded-lg bg-[#00209F]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" /></svg>
      </span>
      <span className="text-[17px] font-extrabold text-white">Haiti<span className="text-[#FF6B7D]">Viral</span> <span className="text-[11px] font-bold text-[#94A3B8]">ADMIN</span></span>
    </span>
  );
}

export function AdminNav({ items, user }: { items: { href: string; label: string; group?: string; badge?: number }[]; user: { name: string; role: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const theme = useAdminTheme();
  const active = (h: string) => (h === "/admin" ? pathname === "/admin" : pathname.startsWith(h));
  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label="Admin">
      {items.map((i, n) => (
        <div key={i.href}>
        {i.group && i.group !== items[n - 1]?.group && <p className="mb-1 mt-3 px-3 text-[11px] font-bold uppercase tracking-wider text-[#64748B]">{i.group}</p>}
        <Link
          href={i.href}
          onClick={() => setOpen(false)}
          aria-current={active(i.href) ? "page" : undefined}
          className={`group flex min-h-10 items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm transition-colors ${active(i.href) ? "bg-[#1E293B] font-bold text-white" : "font-medium text-[#CBD5E1] hover:bg-white/5 hover:text-white"}`}
        >
          <span className={`grid h-6 w-6 shrink-0 place-items-center ${active(i.href) ? "text-white" : "text-[#94A3B8] group-hover:text-white"}`}>
            <AdminIcon name={i.href} width={18} height={18} />
          </span>
          <span className="min-w-0 flex-1 truncate">{i.label}</span>
          {!!i.badge && <span className="rounded-full bg-[#FEF3C7] px-2 text-xs font-bold text-[#92400E]">{i.badge}</span>}
        </Link>
        </div>
      ))}
    </nav>
  );
  const initials = user.name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const footer = (
    <div className="mt-auto space-y-3 border-t border-white/10 pt-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#00209F] text-sm font-black text-white">{initials || "HG"}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-white">{user.name}</span>
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">{user.role.replace("_", " ")}</span>
        </span>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={theme.toggle} className={footerBtn} aria-label={theme.dark ? "Switch to light mode" : "Switch to dark mode"}>
          <AdminIcon name={theme.dark ? "sun" : "moon"} width={20} height={20} />
          {theme.dark ? "Light" : "Dark"}
        </button>
        <a href="/ht" target="_blank" rel="noreferrer" className={footerBtn} aria-label="View the store (new tab)">
          <AdminIcon name="eye" width={20} height={20} />
          Store
        </a>
        <button
          type="button"
          className={`${footerBtn} hover:border-[#FCA5A5] hover:text-[#FCA5A5]`}
          onClick={async () => {
            await authClient.signOut();
            router.push("/admin/login");
          }}
        >
          <AdminIcon name="logout" width={20} height={20} />
          Sign out
        </button>
      </div>
    </div>
  );
  // Up to four shortcuts the person is allowed to open, in this order of daily use.
  const shortcuts: Record<string, typeof HomeIcon> = { "/admin": HomeIcon, "/admin/orders": CartIcon, "/admin/payments": WalletIcon, "/admin/support": ChatIcon, "/admin/products": StoreIcon, "/admin/customers": UserIcon };
  const quick = items.filter((i) => i.href in shortcuts).slice(0, 4).map((i) => ({ ...i, short: shortcuts[i.href], label: i.label === "Dashboard" ? "Home" : i.label }));
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-[240px] shrink-0 flex-col gap-[18px] overflow-y-auto bg-[#0F172A] px-3.5 py-5 text-[#E2E8F0] lg:flex">
        <Link href="/admin"><AdminLogo /></Link>
        {nav}
        {footer}
      </aside>
      <div className="sticky top-0 z-30 flex items-center justify-between bg-[#0F172A] px-3 py-3 text-white lg:hidden">
        <Link href="/admin"><AdminLogo /></Link>
        <button type="button" onClick={() => setOpen(true)} aria-label="Menu" className="p-2"><MenuIcon /></button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col gap-[18px] overflow-y-auto bg-[#0F172A] px-3.5 py-4 text-[#E2E8F0]">
            <div className="flex items-center justify-between"><AdminLogo /><button type="button" onClick={() => setOpen(false)} className="p-2 text-white" aria-label="Close"><CloseIcon /></button></div>
            {nav}
            {footer}
          </div>
        </div>
      )}
      {/* Phone: the most-used screens one tap away; "More" opens the full menu */}
      <nav
        aria-label="Quick admin navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", paddingLeft: "env(safe-area-inset-left, 0px)", paddingRight: "env(safe-area-inset-right, 0px)" }}
      >
        <ul className="grid h-16 grid-cols-5">
          {quick.map((i) => (
            <li key={i.href} className="min-w-0">
              <Link href={i.href} aria-current={active(i.href) ? "page" : undefined} className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active(i.href) ? "text-primary" : "text-muted"}`}>
                <span className={`relative grid h-7 w-11 place-items-center rounded-full ${active(i.href) ? "bg-primary-soft" : ""}`}>
                  <i.short width={18} height={18} />
                  {!!i.badge && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-warning px-1 text-[10px] font-bold text-[#060b1a]">{i.badge}</span>}
                </span>
                <span className="max-w-full truncate px-1">{i.label}</span>
              </Link>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setOpen(true)} className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted">
              <span className="grid h-7 w-11 place-items-center"><MenuIcon width={18} height={18} /></span>
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
