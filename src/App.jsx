import { useState, useEffect } from "react";
import { loginWithGoogle, handleOAuthCallback, fetchCalendarEvents } from "./googleCalendar.js";

const STAFF = [
  { id: 1, name: "田中さん", color: "#7EBFB5" },
  { id: 2, name: "山田さん", color: "#C4A882" },
  { id: 3, name: "鈴木さん", color: "#B8A9C9" },
  { id: 4, name: "伊藤さん", color: "#E8A87C" },
];

const CLEANING_RATE_SOLO = 4500;
const CLEANING_RATE_PAIR = 2250;
const CHECKIN_RATE = 1500;

const DEMO_RESERVATIONS = [
  { id: "demo1", guestName: "佐藤様（デモ）", checkIn: "2026-03-08", checkOut: "2026-03-10" },
  { id: "demo2", guestName: "高橋様（デモ）", checkIn: "2026-03-11", checkOut: "2026-03-13" },
  { id: "demo3", guestName: "渡辺様（デモ）", checkIn: "2026-03-14", checkOut: "2026-03-16" },
];

function getDatesInRange(start, days) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return { day: d.getDate(), dow: days[d.getDay()], month: d.getMonth() + 1 };
}

function isWeekend(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.getDay() === 0 || d.getDay() === 6;
}

function getYearMonth(dateStr) {
  return dateStr.slice(0, 7);
}

function calcPay(taskType, assignedCount) {
  if (taskType === "checkin") return CHECKIN_RATE;
  return assignedCount >= 2 ? CLEANING_RATE_PAIR : CLEANING_RATE_SOLO;
}

function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveLocal(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

export default function App() {
  const [accessToken, setAccessToken] = useState(() => loadLocal("gcal_token", null));
  const [reservations, setReservations] = useState(() => loadLocal("reservations", DEMO_RESERVATIONS));
  const [assignments, setAssignments] = useState(() => loadLocal("assignments", {}));
  const [availability, setAvailability] = useState(() => loadLocal("availability", {}));
  const [completions, setCompletions] = useState(() => loadLocal("completions", {}));
  const [currentStaff, setCurrentStaff] = useState(STAFF[0]);
  const [activeTab, setActiveTab] = useState("schedule");
  const [notification, setNotification] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [reportNote, setReportNote] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isDemo, setIsDemo] = useState(() => !loadLocal("gcal_token", null));

  // persist state
  useEffect(() => saveLocal("assignments", assignments), [assignments]);
  useEffect(() => saveLocal("availability", availability), [availability]);
  useEffect(() => saveLocal("completions", completions), [completions]);
  useEffect(() => saveLocal("reservations", reservations), [reservations]);

  // OAuthコールバック処理（Implicit flow - tokenはURLハッシュで受け取る）
  useEffect(() => {
    console.log("hash:", window.location.hash);
    console.log("search:", window.location.search);
    if (window.location.hash && window.location.hash.includes("access_token")) {
      setIsLoading(true);
      const token = handleOAuthCallback();
      console.log("token:", token ? "取得成功" : "取得失敗");
      if (token) {
        setAccessToken(token);
        saveLocal("gcal_token", token);
        setIsDemo(false);
        fetchCalendarEvents(token)
          .then(events => {
            console.log("events:", events.length);
            setReservations(events);
            showNotification("Googleカレンダーと連携しました ✓");
          })
          .catch(err => {
            console.error("calendar error:", err);
            showNotification("カレンダーの読み込みに失敗: " + err.message);
          })
          .finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    }
  }, []);

  const refreshCalendar = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const events = await fetchCalendarEvents(accessToken);
      setReservations(events);
      showNotification(`予約を更新しました（${events.length}件）`);
    } catch {
      showNotification("更新失敗。再ログインが必要かもしれません。");
      setAccessToken(null);
      saveLocal("gcal_token", null);
      setIsDemo(true);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setAccessToken(null);
    saveLocal("gcal_token", null);
    setReservations(DEMO_RESERVATIONS);
    setIsDemo(true);
    showNotification("ログアウトしました");
  };

  const today = new Date().toISOString().split("T")[0];
  const dates = getDatesInRange(today, 14);

  const allTasks = [
    ...reservations.map(r => ({
      reservationId: r.id, type: "cleaning", date: r.checkOut,
      guestName: r.guestName, taskKey: `cleaning-${r.checkOut}-${r.id}`,
      label: "🧹 清掃", color: "#C4A882",
    })),
    ...reservations.map(r => ({
      reservationId: r.id, type: "checkin", date: r.checkIn,
      guestName: r.guestName, taskKey: `checkin-${r.checkIn}-${r.id}`,
      label: "🏡 CI受付", color: "#7EBFB5",
    })),
  ];

  const toggleAvailability = (date) => {
    const key = `${currentStaff.id}-${date}`;
    setAvailability(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isAvailable = (staffId, date) => availability[`${staffId}-${date}`];

  const assignStaff = (taskKey, staffId) => {
    setAssignments(prev => {
      const current = prev[taskKey] || [];
      return current.includes(staffId)
        ? { ...prev, [taskKey]: current.filter(id => id !== staffId) }
        : { ...prev, [taskKey]: [...current, staffId] };
    });
    showNotification(`${STAFF.find(s => s.id === staffId).name}を担当に追加しました`);
  };

  const reportComplete = (taskKey, staffId) => {
    const now = new Date();
    const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
    setCompletions(prev => ({
      ...prev,
      [taskKey]: { staffId, time: timeStr, date: now.toISOString().split("T")[0], note: reportNote[taskKey] || "" }
    }));
    setReportNote(prev => ({ ...prev, [taskKey]: "" }));
    showNotification("完了を報告しました ✓");
  };

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const getTasksForDate = (date) => allTasks.filter(t => t.date === date);
  const getAssignedStaff = (taskKey) => (assignments[taskKey] || []).map(id => STAFF.find(s => s.id === id));
  const availableStaffForDate = (date) => STAFF.filter(s => isAvailable(s.id, date));
  const unassignedTasks = allTasks.filter(t => dates.includes(t.date) && (!assignments[t.taskKey] || assignments[t.taskKey].length === 0));

  const monthlyStats = () => {
    const stats = {};
    STAFF.forEach(s => { stats[s.id] = { cleaningCount: 0, checkinCount: 0, totalPay: 0, tasks: [] }; });
    Object.entries(completions).forEach(([taskKey, comp]) => {
      const task = allTasks.find(t => t.taskKey === taskKey);
      if (!task || getYearMonth(task.date) !== selectedMonth || !stats[comp.staffId]) return;
      const pay = calcPay(task.type, (assignments[taskKey] || []).length);
      if (task.type === "cleaning") stats[comp.staffId].cleaningCount += 1;
      if (task.type === "checkin") stats[comp.staffId].checkinCount += 1;
      stats[comp.staffId].totalPay += pay;
      stats[comp.staffId].tasks.push({ ...task, completedAt: comp.time, note: comp.note, pay, assignedCount: (assignments[taskKey] || []).length });
    });
    return stats;
  };

  const stats = monthlyStats();
  const months = [...new Set(allTasks.map(t => getYearMonth(t.date)))].sort();

  // ---- Styles ----
  const tabBtn = (active) => ({
    padding: "13px 18px", border: "none", background: "none", cursor: "pointer",
    fontSize: "13px", color: active ? "#2C2416" : "#8C7B6A",
    borderBottom: active ? "2px solid #C4A882" : "2px solid transparent",
    fontFamily: "inherit", transition: "all 0.2s", whiteSpace: "nowrap"
  });
  const card = (accent) => ({
    background: "#FAF5EE", border: "1px solid #D4C4A8",
    borderLeft: `4px solid ${accent}`, borderRadius: "12px",
    padding: "20px 24px", marginBottom: "14px"
  });
  const badge = (ok) => ({
    fontSize: "11px", padding: "2px 10px", borderRadius: "10px",
    background: ok ? "#7EBFB530" : "#E8A87C30",
    color: ok ? "#3A7B72" : "#B85A2A",
    border: `1px solid ${ok ? "#7EBFB5" : "#E8A87C"}`
  });
  const pillBtn = (s, active) => ({
    padding: "7px 18px", border: `2px solid ${active ? s.color : "#D4C4A8"}`,
    background: active ? s.color + "20" : "transparent",
    borderRadius: "20px", cursor: "pointer", fontSize: "13px", color: "#2C2416", fontFamily: "inherit"
  });

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#F5F0E8", fontFamily: "sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "16px" }}>⏳</div>
          <div style={{ color: "#4A3728", fontSize: "16px" }}>Googleカレンダーと連携中...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Hiragino Kaku Gothic ProN','Meiryo',sans-serif", background: "linear-gradient(135deg,#F5F0E8,#EDE4D3,#F0EAE0)", minHeight: "100vh", color: "#2C2416" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#2C2416,#4A3728)", padding: "20px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ color: "#C4A882", fontSize: "11px", letterSpacing: "4px", marginBottom: "4px" }}>SAZARE GUESTHOUSE</div>
          <div style={{ color: "#F5F0E8", fontSize: "20px", fontWeight: "300", letterSpacing: "2px" }}>業務管理システム</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {isDemo && (
            <span style={{ background: "#E8A87C30", border: "1px solid #E8A87C", color: "#E8A87C", fontSize: "11px", padding: "3px 10px", borderRadius: "10px" }}>
              デモモード
            </span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: unassignedTasks.length > 0 ? "#E8A87C" : "#7EBFB5" }} />
            <span style={{ color: "#C4A882", fontSize: "12px" }}>未担当 {unassignedTasks.length}件</span>
          </div>
          {!accessToken ? (
            <button onClick={loginWithGoogle} style={{ padding: "8px 18px", background: "#4285F4", color: "white", border: "none", borderRadius: "8px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>G</span> Googleでログイン
            </button>
          ) : (
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={refreshCalendar} style={{ padding: "8px 14px", background: "#7EBFB530", color: "#7EBFB5", border: "1px solid #7EBFB5", borderRadius: "8px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>
                🔄 カレンダー更新
              </button>
              <button onClick={logout} style={{ padding: "8px 14px", background: "transparent", color: "#C4A882", border: "1px solid #C4A882", borderRadius: "8px", fontSize: "12px", cursor: "pointer", fontFamily: "inherit" }}>
                ログアウト
              </button>
            </div>
          )}
        </div>
      </div>

      {/* デモ案内バナー */}
      {isDemo && (
        <div style={{ background: "#FFF8EE", borderBottom: "1px solid #E8A87C", padding: "10px 28px", fontSize: "12px", color: "#8C5A2A", display: "flex", alignItems: "center", gap: "8px" }}>
          <span>💡</span>
          <span>現在はデモデータを表示中です。「Googleでログイン」するとカレンダーの予約が自動で読み込まれます。カレンダーには <strong>「[予約] ゲスト名」</strong> の形式でイベントを入力してください。</span>
        </div>
      )}

      {notification && (
        <div style={{ position: "fixed", top: "20px", right: "20px", zIndex: 1000, background: "#2C2416", color: "#C4A882", padding: "12px 20px", borderRadius: "8px", fontSize: "13px", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>{notification}</div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #D4C4A8", background: "#FAF5EE", overflowX: "auto" }}>
        {[["schedule","📅 スケジュール"],["availability","🙋 空き登録"],["assign","👤 担当割り当て"],["complete","✅ 完了報告"],["monthly","📊 月次集計"]].map(([k, label]) => (
          <button key={k} onClick={() => setActiveTab(k)} style={tabBtn(activeTab === k)}>{label}</button>
        ))}
      </div>

      <div style={{ padding: "24px 28px", maxWidth: "1100px", margin: "0 auto" }}>

        {/* ===== SCHEDULE ===== */}
        {activeTab === "schedule" && (
          <div style={{ overflowX: "auto" }}>
            <p style={{ color: "#8C7B6A", fontSize: "12px", marginBottom: "14px" }}>今日から14日間のスケジュール（{reservations.length}件の予約）</p>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
              <thead>
                <tr style={{ background: "#F0E8D8" }}>
                  {["日付","タスク","担当スタッフ","対応可能","状況"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", color: "#8C7B6A", letterSpacing: "1px", fontWeight: "500", borderBottom: "1px solid #D4C4A8" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dates.map(date => {
                  const tasks = getTasksForDate(date);
                  const { day, dow, month } = formatDate(date);
                  return (
                    <tr key={date} style={{ background: tasks.length > 0 ? "#FFF8EE" : "transparent" }}>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid #EDE4D3", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: "15px", color: isWeekend(date) ? "#B87B6A" : "#2C2416" }}>{month}/{day}</span>
                        <span style={{ fontSize: "11px", color: "#8C7B6A", marginLeft: "5px" }}>({dow})</span>
                      </td>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid #EDE4D3" }}>
                        {tasks.length === 0 ? <span style={{ color: "#C4B8A8", fontSize: "12px" }}>—</span> :
                          tasks.map(t => (
                            <div key={t.taskKey} style={{ fontSize: "12px", background: t.color + "20", border: `1px solid ${t.color}`, borderRadius: "4px", padding: "3px 8px", display: "inline-block", marginRight: "6px", marginBottom: "2px" }}>
                              {t.label}（{t.guestName}）
                            </div>
                          ))}
                      </td>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid #EDE4D3" }}>
                        {tasks.flatMap(t => getAssignedStaff(t.taskKey).map(s => (
                          <span key={s.id} style={{ display: "inline-block", background: s.color + "30", border: `1px solid ${s.color}`, borderRadius: "20px", padding: "2px 10px", fontSize: "12px", marginRight: "4px" }}>{s.name}</span>
                        )))}
                      </td>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid #EDE4D3" }}>
                        {availableStaffForDate(date).length > 0
                          ? availableStaffForDate(date).map(s => <span key={s.id} style={{ fontSize: "11px", color: "#6A8C6A", marginRight: "6px" }}>{s.name}</span>)
                          : <span style={{ fontSize: "11px", color: "#C4B8A8" }}>なし</span>}
                      </td>
                      <td style={{ padding: "11px 14px", borderBottom: "1px solid #EDE4D3" }}>
                        {tasks.map(t => completions[t.taskKey]
                          ? <span key={t.taskKey} style={{ fontSize: "11px", color: "#3A7B72", background: "#E8F5F0", padding: "2px 8px", borderRadius: "10px", marginRight: "4px" }}>✓ 完了</span>
                          : <span key={t.taskKey} style={{ fontSize: "11px", color: "#C4B8A8" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ===== AVAILABILITY ===== */}
        {activeTab === "availability" && (
          <div>
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "13px", color: "#8C7B6A" }}>スタッフ：</span>
              {STAFF.map(s => <button key={s.id} onClick={() => setCurrentStaff(s)} style={pillBtn(s, currentStaff.id === s.id)}>{s.name}</button>)}
            </div>
            <p style={{ fontSize: "12px", color: "#8C7B6A", marginBottom: "14px" }}>{currentStaff.name}の出勤可能日をタップ（●=タスクあり）</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "6px" }}>
              {dates.map(date => {
                const { day, dow, month } = formatDate(date);
                const avail = isAvailable(currentStaff.id, date);
                const hasTasks = getTasksForDate(date).length > 0;
                return (
                  <button key={date} onClick={() => toggleAvailability(date)} style={{ padding: "12px 6px", background: avail ? currentStaff.color + "30" : "#FAF5EE", border: avail ? `2px solid ${currentStaff.color}` : "2px solid #E4D8C8", borderRadius: "8px", cursor: "pointer", textAlign: "center", position: "relative", fontFamily: "inherit" }}>
                    {hasTasks && <div style={{ position: "absolute", top: "4px", right: "4px", width: "5px", height: "5px", borderRadius: "50%", background: "#C4A882" }} />}
                    <div style={{ fontSize: "10px", color: "#8C7B6A" }}>{month}/{day}</div>
                    <div style={{ fontSize: "13px", color: isWeekend(date) ? "#B87B6A" : "#2C2416" }}>({dow})</div>
                    {avail && <div style={{ fontSize: "10px", color: currentStaff.color, marginTop: "2px" }}>✓</div>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== ASSIGN ===== */}
        {activeTab === "assign" && (
          <div>
            {allTasks.filter(t => dates.includes(t.date)).length === 0 && (
              <div style={{ color: "#8C7B6A", fontSize: "13px", padding: "40px", textAlign: "center", background: "#FAF5EE", borderRadius: "12px" }}>
                この期間のタスクはありません
              </div>
            )}
            {allTasks.filter(t => dates.includes(t.date)).map(task => {
              const assigned = getAssignedStaff(task.taskKey);
              const { day, dow, month } = formatDate(task.date);
              const isPair = assigned.length >= 2;
              const rateNote = task.type === "cleaning"
                ? (isPair ? `2名体制 → 各¥${CLEANING_RATE_PAIR.toLocaleString()}` : `1名 → ¥${CLEANING_RATE_SOLO.toLocaleString()}`)
                : `¥${CHECKIN_RATE.toLocaleString()}`;
              return (
                <div key={task.taskKey} style={card(assigned.length > 0 ? "#7EBFB5" : "#E8A87C")}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "16px", color: "#4A3728" }}>{month}/{day}（{dow}）</span>
                      <span style={{ fontSize: "13px", background: task.color + "20", border: `1px solid ${task.color}`, borderRadius: "4px", padding: "2px 8px" }}>{task.label}</span>
                      <span style={badge(assigned.length > 0)}>{assigned.length > 0 ? "担当確定" : "未割り当て"}</span>
                    </div>
                    <span style={{ fontSize: "13px", color: "#6A5A4A" }}>{task.guestName}</span>
                  </div>
                  {assigned.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
                      {assigned.map(s => <span key={s.id} style={{ background: s.color + "30", border: `1px solid ${s.color}`, borderRadius: "20px", padding: "3px 12px", fontSize: "13px" }}>{s.name}</span>)}
                      <span style={{ fontSize: "11px", color: "#8C7B6A" }}>報酬：{rateNote}</span>
                    </div>
                  )}
                  <div style={{ borderTop: "1px solid #E4D8C8", paddingTop: "12px" }}>
                    <div style={{ fontSize: "11px", color: "#8C7B6A", marginBottom: "8px" }}>
                      担当スタッフを選択（空き登録済みのみ可）
                      {task.type === "cleaning" && <span style={{ marginLeft: "8px", color: "#B87B6A" }}>※2名で各¥{CLEANING_RATE_PAIR.toLocaleString()}</span>}
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {STAFF.map(s => {
                        const isAv = isAvailable(s.id, task.date);
                        const isAssigned = (assignments[task.taskKey] || []).includes(s.id);
                        return (
                          <button key={s.id} onClick={() => isAv && assignStaff(task.taskKey, s.id)} style={{ padding: "6px 14px", border: `2px solid ${isAssigned ? s.color : isAv ? "#C4C4C4" : "#E4D8C8"}`, background: isAssigned ? s.color + "30" : "transparent", borderRadius: "20px", cursor: isAv ? "pointer" : "not-allowed", fontSize: "12px", color: isAv ? "#2C2416" : "#C4B8A8", fontFamily: "inherit", opacity: isAv ? 1 : 0.5 }}>
                            {s.name}{!isAv && <span style={{ fontSize: "10px" }}>（未登録）</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ===== COMPLETE ===== */}
        {activeTab === "complete" && (
          <div>
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "13px", color: "#8C7B6A" }}>報告するスタッフ：</span>
              {STAFF.map(s => <button key={s.id} onClick={() => setCurrentStaff(s)} style={pillBtn(s, currentStaff.id === s.id)}>{s.name}</button>)}
            </div>
            {allTasks.filter(t => (assignments[t.taskKey] || []).includes(currentStaff.id)).length === 0 ? (
              <div style={{ color: "#8C7B6A", fontSize: "13px", padding: "40px", textAlign: "center", background: "#FAF5EE", borderRadius: "12px" }}>
                {currentStaff.name}に割り当てられたタスクがありません
              </div>
            ) : allTasks.filter(t => (assignments[t.taskKey] || []).includes(currentStaff.id)).map(task => {
              const { day, dow, month } = formatDate(task.date);
              const comp = completions[task.taskKey];
              const pay = calcPay(task.type, (assignments[task.taskKey] || []).length);
              return (
                <div key={task.taskKey} style={card(comp ? "#7EBFB5" : "#C4A882")}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "16px", color: "#4A3728" }}>{month}/{day}（{dow}）</span>
                      <span style={{ fontSize: "13px", background: task.color + "20", border: `1px solid ${task.color}`, borderRadius: "4px", padding: "2px 8px" }}>{task.label}</span>
                      <span style={{ fontSize: "12px", color: "#6A5A4A" }}>{task.guestName}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "13px", color: "#C4A882", fontWeight: "500" }}>¥{pay.toLocaleString()}</span>
                      <span style={badge(!!comp)}>{comp ? `✓ 完了 ${comp.time}` : "未完了"}</span>
                    </div>
                  </div>
                  {comp ? (
                    <div style={{ background: "#E8F5F0", border: "1px solid #7EBFB5", borderRadius: "8px", padding: "10px 14px", fontSize: "12px", color: "#2A6B5E", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>✓</span>
                      <span>完了報告済み（{comp.time}）{comp.note && ` — ${comp.note}`}</span>
                    </div>
                  ) : (
                    <div>
                      <textarea
                        placeholder="メモ（任意）例：タオル補充済み、鍵の返却確認"
                        value={reportNote[task.taskKey] || ""}
                        onChange={e => setReportNote(prev => ({ ...prev, [task.taskKey]: e.target.value }))}
                        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "8px", border: "1px solid #D4C4A8", background: "#FFF8F0", fontSize: "13px", fontFamily: "inherit", resize: "vertical", minHeight: "60px", marginBottom: "10px", color: "#2C2416" }}
                      />
                      <button onClick={() => reportComplete(task.taskKey, currentStaff.id)} style={{ padding: "10px 24px", background: "linear-gradient(135deg,#4A3728,#6A5040)", color: "#F5F0E8", border: "none", borderRadius: "8px", fontSize: "13px", cursor: "pointer", fontFamily: "inherit" }}>
                        完了を報告する
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ===== MONTHLY ===== */}
        {activeTab === "monthly" && (
          <div>
            <div style={{ display: "flex", gap: "10px", marginBottom: "24px", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: "13px", color: "#8C7B6A" }}>対象月：</span>
              {months.map(m => (
                <button key={m} onClick={() => setSelectedMonth(m)} style={{ padding: "7px 18px", border: `2px solid ${selectedMonth === m ? "#C4A882" : "#D4C4A8"}`, background: selectedMonth === m ? "#C4A88220" : "transparent", borderRadius: "20px", cursor: "pointer", fontSize: "13px", color: "#2C2416", fontFamily: "inherit" }}>
                  {m.replace("-", "年")}月
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: "16px", marginBottom: "24px" }}>
              {STAFF.map(s => {
                const st = stats[s.id] || { cleaningCount: 0, checkinCount: 0, totalPay: 0 };
                return (
                  <div key={s.id} style={{ background: "#FAF5EE", border: `1px solid ${s.color}`, borderTop: `4px solid ${s.color}`, borderRadius: "12px", padding: "20px" }}>
                    <div style={{ fontSize: "15px", fontWeight: "500", marginBottom: "14px" }}>{s.name}</div>
                    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "28px", fontWeight: "300", color: "#4A3728", lineHeight: 1 }}>{st.cleaningCount}</div>
                        <div style={{ fontSize: "10px", color: "#8C7B6A", marginTop: "2px" }}>🧹 清掃</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "28px", fontWeight: "300", color: "#4A3728", lineHeight: 1 }}>{st.checkinCount}</div>
                        <div style={{ fontSize: "10px", color: "#8C7B6A", marginTop: "2px" }}>🏡 CI</div>
                      </div>
                      <div style={{ textAlign: "right", flex: 1 }}>
                        <div style={{ fontSize: "20px", color: "#6A5040", fontWeight: "500" }}>¥{st.totalPay.toLocaleString()}</div>
                        <div style={{ fontSize: "10px", color: "#8C7B6A" }}>今月の報酬</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ background: "linear-gradient(135deg,#2C2416,#4A3728)", borderRadius: "12px", padding: "20px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", color: "#F5F0E8", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "11px", color: "#C4A882", letterSpacing: "2px" }}>TOTAL — {selectedMonth.replace("-", "年")}月</div>
                <div style={{ fontSize: "13px", marginTop: "6px", color: "#E8DDD0" }}>
                  清掃 {STAFF.reduce((s, st) => s + (stats[st.id]?.cleaningCount || 0), 0)}件　CI受付 {STAFF.reduce((s, st) => s + (stats[st.id]?.checkinCount || 0), 0)}件
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "11px", color: "#C4A882", letterSpacing: "2px" }}>支払い合計</div>
                <div style={{ fontSize: "28px", fontWeight: "300", color: "#C4A882" }}>
                  ¥{STAFF.reduce((s, st) => s + (stats[st.id]?.totalPay || 0), 0).toLocaleString()}
                </div>
              </div>
            </div>
            {STAFF.map(s => {
              const tasks = stats[s.id]?.tasks || [];
              if (!tasks.length) return null;
              return (
                <div key={s.id} style={{ background: "#FAF5EE", border: "1px solid #D4C4A8", borderRadius: "12px", padding: "20px 24px", marginBottom: "12px" }}>
                  <div style={{ fontSize: "14px", fontWeight: "500", marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: s.color, display: "inline-block" }} />
                    {s.name}の業務履歴
                  </div>
                  {tasks.map((t, i) => {
                    const { day, dow, month } = formatDate(t.date);
                    return (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #EDE4D3", fontSize: "13px", color: "#4A3728", flexWrap: "wrap", gap: "4px" }}>
                        <span>{month}/{day}（{dow}） {t.label}（{t.guestName}）{t.assignedCount >= 2 && <span style={{ fontSize: "11px", color: "#8C7B6A" }}> 2名体制</span>}</span>
                        <span style={{ color: "#C4A882", fontWeight: "500" }}>¥{t.pay.toLocaleString()} <span style={{ color: "#8C7B6A", fontWeight: "400", fontSize: "11px" }}>{t.completedAt}{t.note && ` ｜ ${t.note}`}</span></span>
                      </div>
                    );
                  })}
                  <div style={{ textAlign: "right", paddingTop: "10px", fontSize: "14px", color: "#6A5040", fontWeight: "500" }}>
                    小計：¥{(stats[s.id]?.totalPay || 0).toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
