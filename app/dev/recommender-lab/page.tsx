import { notFound, redirect } from "next/navigation";
import { RecommenderLabClient } from "@/components/recommender-lab-client";
import { getSpotifySession } from "@/lib/session";

export default async function RecommenderLabPage() {
  if (process.env.NODE_ENV === "production") notFound();
  if (!(await getSpotifySession())) redirect("/");
  return <RecommenderLabClient />;
}
