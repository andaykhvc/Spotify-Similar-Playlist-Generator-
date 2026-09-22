import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlaylistReviewClient } from "@/components/playlist-review-client";
import { getSpotifySession } from "@/lib/session";
import { isExternalRecommenderEnabled } from "@/lib/env";

export const metadata: Metadata = {
  title: "Çalma listesini gözden geçir",
};

interface PlaylistPageProps {
  params: Promise<{ playlistId: string }>;
}

export default async function PlaylistPage({ params }: PlaylistPageProps) {
  if (!(await getSpotifySession())) {
    redirect("/");
  }

  const { playlistId } = await params;
  return (
    <PlaylistReviewClient
      playlistId={playlistId}
      recommendationsEnabled={isExternalRecommenderEnabled()}
    />
  );
}
