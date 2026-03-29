const SPOTIFY_CLIENT_ID = "cedbb23289bd4fc4ab0e95b015059263";
const SPOTIFY_CLIENT_SECRET = "6b0b1e23060b48bca438f93ea0be7937";
const SCOPES = "user-read-currently-playing user-read-recently-played user-read-playback-state user-top-read";

export function getAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
  });
  return `https://accounts.spotify.com/authorize?${params}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function spotifyApi(accessToken: string, endpoint: string): Promise<any> {
  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 204) return null; // no content (nothing playing)
  if (res.status === 401) throw new Error("TOKEN_EXPIRED");
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
  return res.json();
}
