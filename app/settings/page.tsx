import type { Metadata } from "next";
import { SettingsScreen } from "@/components/SettingsScreen";

export const metadata: Metadata = { title: "設定 — Chatkari" };

export default function SettingsPage() {
  return <SettingsScreen />;
}

