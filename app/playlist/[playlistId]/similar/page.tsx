import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SimilarPlaylistClient } from "@/components/similar-playlist-client";
import { getSpotifySession } from "@/lib/session";

export const metadata: Metadata = { title: "Benzer çalma listesi" };

export default async function SimilarPlaylistPage({
  params,
}: {
  params: Promise<{ playlistId: string }>;
}) {
  if (!(await getSpotifySession())) redirect("/");
  const { playlistId } = await params;
  return <SimilarPlaylistClient playlistId={playlistId} />;
}
