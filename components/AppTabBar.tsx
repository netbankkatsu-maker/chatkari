"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "探す", icon: "♡" },
  { href: "/chats", label: "チャット", icon: "▤" },
  { href: "/settings", label: "設定", icon: "⚙" },
];

export function AppTabBar() {
  const pathname = usePathname();
  return (
    <nav className="app-tab-bar" aria-label="メインメニュー">
      {tabs.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return <Link key={tab.href} href={tab.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}><span aria-hidden="true">{tab.icon}</span><small>{tab.label}</small></Link>;
      })}
    </nav>
  );
}
