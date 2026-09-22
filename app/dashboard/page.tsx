import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard-client";
import { getSpotifySession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Çalma listelerin",
};

interface DashboardPageProps {
  searchParams: Promise<{ unavailable?: string | string[] }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  if (!(await getSpotifySession())) {
    redirect("/");
  }

  const { unavailable } = await searchParams;
  return (
    <DashboardClient
      unavailablePlaylistId={
        typeof unavailable === "string" ? unavailable : null
      }
    />
  );
}
