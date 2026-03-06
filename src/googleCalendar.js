// Google Calendar API 連携モジュール
// OAuth2.0 PKCE フロー（クライアントシークレット不要）

const CLIENT_ID = "821813243433-d10pkn742augkf505fvntrcte1md01q1.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/calendar.readonly";
const REDIRECT_URI = window.location.origin;

// ---- PKCE ヘルパー ----
function generateCodeVerifier() {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ---- ログイン ----
export async function loginWithGoogle() {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = crypto.randomUUID();

  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("pkce_state", state);

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    access_type: "offline",
    prompt: "consent",
  });

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ---- コールバック処理（URLのcodeを交換） ----
export async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");

  if (!code) return null;

  const savedState = sessionStorage.getItem("pkce_state");
  if (state !== savedState) throw new Error("State mismatch");

  const verifier = sessionStorage.getItem("pkce_verifier");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) throw new Error("Token exchange failed");
  const tokens = await res.json();

  // URLのcodeパラメータをきれいにする
  window.history.replaceState({}, "", window.location.pathname);
  sessionStorage.removeItem("pkce_verifier");
  sessionStorage.removeItem("pkce_state");

  return tokens.access_token;
}

// ---- カレンダーイベント取得 ----
export async function fetchCalendarEvents(accessToken) {
  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + 60);

  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: future.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) throw new Error("Calendar fetch failed");
  const data = await res.json();

  // 「[予約]」タグのついたイベントだけを変換
  return (data.items || [])
    .filter(ev => ev.summary && ev.summary.includes("[予約]"))
    .map(ev => ({
      id: ev.id,
      guestName: ev.summary.replace("[予約]", "").trim(),
      checkIn: ev.start.date || ev.start.dateTime?.split("T")[0],
      checkOut: ev.end.date || ev.end.dateTime?.split("T")[0],
    }));
}
