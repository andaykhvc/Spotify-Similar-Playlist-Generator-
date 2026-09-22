export interface SpotifyEnvironment {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  appUrl: string;
  sessionSecret: string;
}

export interface RecommendationEnvironment {
  externalRecommenderEnabled: boolean;
  freqBlogApiKey?: string;
}

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function normalizeAppUrl(value: string): string {
  const url = new URL(value);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("APP_URL must use http or https");
  }

  return url.origin;
}

export function getSpotifyEnvironment(): SpotifyEnvironment {
  const sessionSecret = requireEnvironmentVariable("SESSION_SECRET");

  if (Buffer.byteLength(sessionSecret, "utf8") < 32) {
    throw new Error("SESSION_SECRET must be at least 32 bytes long");
  }

  return {
    clientId: requireEnvironmentVariable("SPOTIFY_CLIENT_ID"),
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET?.trim() || undefined,
    redirectUri: requireEnvironmentVariable("SPOTIFY_REDIRECT_URI"),
    appUrl: normalizeAppUrl(requireEnvironmentVariable("APP_URL")),
    sessionSecret,
  };
}

export function isExternalRecommenderEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.EXTERNAL_RECOMMENDER_ENABLED?.trim().toLowerCase() === "true";
}

export function getRecommendationEnvironment(): RecommendationEnvironment {
  return {
    externalRecommenderEnabled: isExternalRecommenderEnabled(),
    freqBlogApiKey: process.env.FREQBLOG_API_KEY?.trim() || undefined,
  };
}
