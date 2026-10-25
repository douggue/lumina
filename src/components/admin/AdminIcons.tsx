import type { SVGProps } from "react";

/** Line icons for the admin menu (24×24, stroke = currentColor). Keyed by the page address. */
const PATHS: Record<string, string[]> = {
  "/admin": ["M3 10.5 12 3l9 7.5", "M5 9.5V20h5v-6h4v6h5V9.5"],
  "/admin/orders": ["M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z", "M3 6h18", "M16 10a4 4 0 0 1-8 0"],
  "/admin/payments": ["M3 7h18v12H3z", "M3 11h18", "M7 15h3"],
  "/admin/reconciliation": ["M9 11l3 3L22 4", "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"],
  "/admin/risk": ["M12 3 2 20h20L12 3Z", "M12 10v4", "M12 17.5v.01"],
  "/admin/approvals": ["M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5Z", "m8.5 12 2.5 2.5 4.5-5"],
  "/admin/support": ["M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-5A8 8 0 1 1 21 12Z"],
  "/admin/trust": ["M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5L2.6 9.3l6.5-.9Z"],
  "/admin/suppliers": ["M3 7h11v9H3Z", "M14 10h4l3 3v3h-7", "M7 19a2 2 0 1 0 0-.01", "M17 19a2 2 0 1 0 0-.01"],
  "/admin/services": ["M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6Z", "M9 12h6", "M12 9v6"],
  "/admin/pricing": ["M12 2v20", "M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"],
  "/admin/products": ["M21 8 12 3 3 8v8l9 5 9-5Z", "M3 8l9 5 9-5", "M12 13v8"],
  "/admin/codes": ["M15 7h3a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4V9a2 2 0 0 1 2-2h3", "M12 7v10"],
  "/admin/media": ["M3 5h18v14H3z", "m3 16 5-5 4 4 3-3 6 6", "M15.5 9.5h.01"],
  "/admin/customers": ["M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1", "M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M22 19v-1a4 4 0 0 0-3-3.9", "M16 3.1a3.5 3.5 0 0 1 0 6.8"],
  "/admin/wallet": ["M4 4h12a2 2 0 0 1 2 2v2", "M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16V8H4", "M16 14h.01"],
  "/admin/referrals": ["M20 12v9H4v-9", "M2 7h20v5H2z", "M12 21V7", "M12 7H8a2.5 2.5 0 1 1 0-5c3 0 4 5 4 5Z", "M12 7h4a2.5 2.5 0 1 0 0-5c-3 0-4 5-4 5Z"],
  "/admin/analytics": ["M3 3v18h18", "M7 15l4-4 3 3 6-6"],
  "/admin/homepage": ["M3 4h18v6H3z", "M3 14h8v6H3z", "M15 14h6v6h-6z"],
  "/admin/news": ["M4 4h13v16H6a2 2 0 0 1-2-2Z", "M17 8h3v10a2 2 0 0 1-2 2", "M8 8h5", "M8 12h5", "M8 16h3"],
  "/admin/pages": ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z", "M14 2v6h6", "M8 13h8", "M8 17h5"],
  "/admin/navigation": ["M4 6h16", "M4 12h16", "M4 18h10"],
  "/admin/newsletter": ["M3 5h18v14H3z", "m3 6 9 7 9-7"],
  "/admin/appearance": ["M12 22a10 10 0 1 1 10-10c0 2.8-2.2 3-4 3h-1.5a1.5 1.5 0 0 0-1 2.6A1.6 1.6 0 0 1 14.4 21 10 10 0 0 1 12 22Z", "M7.5 11h.01", "M10 7h.01", "M15 7.5h.01"],
  "/admin/translations": ["M4 5h8", "M8 3v2", "M5.5 5c.5 3 2.5 6 5.5 7.5", "M10.5 5C10 8 7.5 11 4 12.5", "m12 21 4.5-10 4.5 10", "M13.5 18h6"],
  "/admin/seo": ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z", "m21 21-4.3-4.3"],
  "/admin/staff": ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4 21v-1a6 6 0 0 1 9-5.2", "m17 15 1.5 1.5L21.5 13"],
  "/admin/security": ["M5 11h14v10H5z", "M8 11V7a4 4 0 0 1 8 0v4"],
  "/admin/payment-methods": ["M2 6h20v12H2z", "M2 10h20", "M6 15h4"],
  "/admin/exchange": ["M7 7h13l-4-4", "M17 17H4l4 4"],
  "/admin/email": ["M22 6 12 13 2 6", "M2 5h20v14H2z"],
  "/admin/settings": ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"],
  "/admin/audit": ["M12 8v4l3 2", "M3.05 11a9 9 0 1 1 .5 4", "M3 4v5h5"],
  // Footer actions
  sun: ["M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z", "M12 1v2", "M12 21v2", "M4.2 4.2l1.4 1.4", "M18.4 18.4l1.4 1.4", "M1 12h2", "M21 12h2", "M4.2 19.8l1.4-1.4", "M18.4 5.6l1.4-1.4"],
  moon: ["M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"],
  eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "m16 17 5-5-5-5", "M21 12H9"],
};

export function AdminIcon({ name, ...props }: { name: string } & SVGProps<SVGSVGElement>) {
  const paths = PATHS[name] ?? PATHS["/admin/pages"];
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
