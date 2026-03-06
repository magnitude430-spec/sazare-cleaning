// Google Calendar API 連携モジュール
// Implicit flow（トークンをURLフラグメントで受け取る、サーバー不要）

const CLIENT_ID = "821813243433-d10pkn742augkf505fvntrcte1md01q1.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/calendar.readonly";

// ---- ログイン（Implicit flow） ----
export function loginWithGoogle() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: window.location.origin + window.location.pathname,
    response_type: "token",
    scope: SCOPES,
    prompt: "consent",
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ---- コールバック処理（URLハッシュからトークンを取得） ----
export function handleOAuthCallback() {
  // URLのハッシュ部分（#access_token=...）を解析
  const hash = window.location.hash.substring(1);
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const token = params.get("access_token");
  if (!token) return null;

  // URLをきれいにする
  window.history.replaceState({}, "", window.location.pathname);
  return token;
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
