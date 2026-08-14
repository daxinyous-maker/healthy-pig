const STORAGE_KEY = "shengxi-offline-v1";
const TYPES = {
  sleep: { label: "睡眠", icon: "🌙", unit: "小时", value: 7.5, kind: "duration", direction: "more" },
  meal: { label: "饮食", icon: "🥗", unit: "千卡", value: 0, kind: "number", direction: "neutral" },
  exercise: { label: "运动", icon: "🏃", unit: "分钟", value: 30, kind: "duration", direction: "more" },
  water: { label: "饮水", icon: "💧", unit: "ml", value: 300, kind: "number", direction: "more" },
  smoking: { label: "吸烟", icon: "🚭", unit: "根", value: 0, kind: "count", direction: "less", goal: 0 },
  alcohol: { label: "饮酒", icon: "🍷", unit: "杯", value: 0, kind: "count", direction: "less", goal: 0 },
};
const { DEFAULT_AVATARS: AVATARS, escapeHtml: esc, isRecord, safeAvatar, safeIdentifier, safeText } = window.HealthyPigSecurity;
const DEFAULT_PLANS = [
  { id: "sleep-plan", icon: "🌙", title: "23:00 前放下手机", detail: "给大脑一点放松时间", repeat: "daily", completedDates: [], createdDate: "" },
  { id: "food-plan", icon: "🥗", title: "吃满 3 份蔬果", detail: "给身体补充缤纷营养", repeat: "daily", completedDates: [], createdDate: "" },
  { id: "exercise-plan", icon: "🏃", title: "活动 50 分钟", detail: "散步也算认真运动", repeat: "daily", completedDates: [], createdDate: "" },
];
const DEFAULT_STATE = {
  version: 5,
  profile: { nickname: "宝宝", avatar: "😊" },
  visible: [],
  removedBuiltins: [],
  customHabits: [],
  entries: [],
  plans: DEFAULT_PLANS,
  goals: { sleep: 7.5, exercise: 50, water: 1800 },
  notificationDate: "",
  notificationsSeen: false,
  lastBackupAt: "",
  typeOrder: ["sleep", "meal", "exercise", "water", "smoking", "alcohol"],
  dayNotes: {},
};

let state = loadState();
let view = "today";
let recordType = "exercise";
let editingPlanIndex = -1;
let smartResults = [];
let trendDetailType = null;
let editingGoalType = null;
let editingEntryId = null;
let trendDays = 7;
let editingDayNoteKey = null;
let toastTimer;

const screen = document.querySelector("#screen");
const recordDialog = document.querySelector("#record-dialog");
const tabs = document.querySelector("#type-tabs");
const fields = document.querySelector("#record-fields");

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function localDayKey(date = new Date()) { const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 10); }
function safeDayKey(value, fallback = "") { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback; }
function safeDateTime(value, fallback = "") { return typeof value === "string" && value.length <= 40 && Number.isFinite(new Date(value).getTime()) ? value : fallback; }
function safeNumber(value, fallback, minimum = -1_000_000_000, maximum = 1_000_000_000) { const number = Number(value); return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback; }
function normalizePlan(plan, index) {
  const source = isRecord(plan) ? plan : {};
  return {
    id: safeIdentifier(source.id, `plan-${index}`),
    icon: safeText(source.icon, "🌱", 16) || "🌱",
    title: safeText(source.title, "健康计划", 80) || "健康计划",
    detail: safeText(source.detail, "", 240),
    repeat: ["daily", "weekdays", "weekends", "once"].includes(source.repeat) ? source.repeat : "daily",
    completedDates: Array.isArray(source.completedDates) ? source.completedDates.slice(0, 5000).map((date) => safeDayKey(date)).filter(Boolean) : source.done ? [localDayKey()] : [],
    createdDate: safeDayKey(source.createdDate, localDayKey()),
  };
}
function normalizeState(saved) {
  const source = isRecord(saved) ? saved : {};
  const oldPlans = Array.isArray(source.plans) ? source.plans.slice(0, 1000) : [];
  const sourcePlans = oldPlans.length && typeof oldPlans[0] === "boolean"
    ? DEFAULT_PLANS.map((plan, index) => ({ ...plan, done: Boolean(oldPlans[index]) }))
    : oldPlans.length ? oldPlans : DEFAULT_PLANS;
  const webHabits = Array.isArray(source.habits) ? source.habits.slice(0, 200) : null;
  const rawCustomHabits = Array.isArray(source.customHabits)
    ? source.customHabits.slice(0, 200)
    : webHabits
      ? webHabits.filter((habit) => isRecord(habit) && !habit.builtIn && !["smoking", "alcohol"].includes(habit.id))
      : [];
  const customHabits = rawCustomHabits.map((habit) => {
    if (!isRecord(habit)) return null;
    const id = safeIdentifier(habit.id);
    if (!id || TYPES[id]) return null;
    const kind = ["number", "boolean", "count", "duration", "rating", "text"].includes(habit.kind) ? habit.kind : "number";
    const direction = ["more", "less", "neutral"].includes(habit.direction) ? habit.direction : "neutral";
    return {
      id,
      name: safeText(habit.name, "自定义习惯", 40) || "自定义习惯",
      icon: safeText(habit.icon, "🌿", 16) || "🌿",
      unit: safeText(habit.unit, kind === "text" ? "" : "次", 24),
      kind,
      direction: kind === "text" ? "neutral" : direction,
      goal: direction === "neutral" || kind === "text" ? undefined : safeNumber(habit.goal, 0),
      ratingMax: kind === "rating" ? safeNumber(habit.ratingMax, 5, 3, 10) : undefined,
    };
  }).filter(Boolean).filter((habit, index, habits) => habits.findIndex((item) => item.id === habit.id) === index);
  const customIds = new Set(customHabits.map((habit) => habit.id));
  const allowedTypes = new Set([...Object.keys(TYPES), ...customIds]);
  const entries = (Array.isArray(source.entries) ? source.entries : []).slice(0, 100000).map((entry, index) => {
    if (!isRecord(entry)) return null;
    const type = safeIdentifier(entry.type);
    const recordedAt = safeDateTime(entry.recordedAt);
    if (!type || !recordedAt) return null;
    return {
      id: Number.isFinite(Number(entry.id)) ? Math.trunc(Number(entry.id)) : Date.now() + index,
      type,
      value: safeNumber(entry.value, 0),
      unit: safeText(entry.unit, "", 24),
      note: safeText(entry.note, "", 1000),
      recordedAt,
    };
  }).filter(Boolean);
  const savedProfile = isRecord(source.profile) ? source.profile : {};
  const savedGoals = isRecord(source.goals) ? source.goals : {};
  const visibleSource = Array.isArray(source.visible) ? source.visible : webHabits ? webHabits.filter((habit) => isRecord(habit) && habit.visible).map((habit) => habit.id) : [];
  const removedSource = Array.isArray(source.removedBuiltins) ? source.removedBuiltins : webHabits ? ["smoking", "alcohol"].filter((id) => !webHabits.some((habit) => isRecord(habit) && habit.id === id)) : [];
  const visible = visibleSource.slice(0, 500).map((id) => safeIdentifier(id)).filter((id) => allowedTypes.has(id));
  const removedBuiltins = removedSource.filter((id) => ["smoking", "alcohol"].includes(id));
  const dayNotes = {};
  if (isRecord(source.dayNotes)) Object.entries(source.dayNotes).slice(0, 5000).forEach(([date, note]) => { const key = safeDayKey(date); if (key && typeof note === "string") dayNotes[key] = safeText(note, "", 500); });
  const next = {
    ...clone(DEFAULT_STATE),
    version: 5,
    profile: { nickname: safeText(savedProfile.nickname, DEFAULT_STATE.profile.nickname, 40) || DEFAULT_STATE.profile.nickname, avatar: safeAvatar(savedProfile.avatar, DEFAULT_STATE.profile.avatar) },
    goals: { sleep: safeNumber(savedGoals.sleep, DEFAULT_STATE.goals.sleep, 0.1), exercise: safeNumber(savedGoals.exercise, DEFAULT_STATE.goals.exercise, 0.1), water: safeNumber(savedGoals.water, DEFAULT_STATE.goals.water, 0.1) },
    plans: sourcePlans.map(normalizePlan),
    customHabits,
    entries,
    visible: [...new Set(visible)],
    removedBuiltins: [...new Set(removedBuiltins)],
    notificationDate: safeDayKey(source.notificationDate),
    notificationsSeen: source.notificationsSeen === true,
    lastBackupAt: safeDateTime(source.lastBackupAt),
    typeOrder: (Array.isArray(source.typeOrder) ? source.typeOrder : clone(DEFAULT_STATE.typeOrder)).slice(0, 500).map((id) => safeIdentifier(id)).filter((id) => allowedTypes.has(id)),
    dayNotes,
  };
  const allTypes = ["sleep", "meal", "exercise", "water", ...next.visible, ...next.customHabits.map((habit) => habit.id)];
  next.typeOrder = [...new Set([...next.typeOrder, ...allTypes])];
  if (next.notificationDate !== localDayKey()) { next.notificationDate = localDayKey(); next.notificationsSeen = false; }
  return next;
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return normalizeState(saved || DEFAULT_STATE);
  } catch { return normalizeState(DEFAULT_STATE); }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function nowLocal() { const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return date.toISOString().slice(0, 16); }
function isToday(date) { return new Date(date).toDateString() === new Date().toDateString(); }
function planAppliesToday(plan) { const day = new Date().getDay(); if (plan.repeat === "weekdays") return day >= 1 && day <= 5; if (plan.repeat === "weekends") return day === 0 || day === 6; if (plan.repeat === "once") return !plan.completedDates.length || plan.completedDates.includes(localDayKey()); return true; }
function planDoneToday(plan) { return plan.completedDates.includes(localDayKey()); }
function repeatLabel(value) { return ({ daily: "每天", weekdays: "工作日", weekends: "周末", once: "仅一次" })[value] || "每天"; }
function latest(type) { return state.entries.find((entry) => entry.type === type && isToday(entry.recordedAt)) || null; }
function getMeta(type) {
  if (TYPES[type]) return { ...TYPES[type], goal: ["sleep", "exercise", "water"].includes(type) ? state.goals[type] : TYPES[type].goal };
  const habit = state.customHabits.find((item) => item.id === type);
  return habit ? { label: habit.name, icon: habit.icon, unit: habit.unit, value: 0, kind: habit.kind, direction: habit.direction, goal: habit.goal, ratingMax: habit.ratingMax || 5 } : { label: "自定义", icon: "🌿", unit: "次", value: 0, kind: "number", direction: "neutral" };
}
function enabledTypes() {
  const optional = state.visible.filter((type) => !state.removedBuiltins.includes(type));
  const enabled = ["sleep", "meal", "exercise", "water", ...optional, ...state.customHabits.map((habit) => habit.id)];
  return enabled.sort((a, b) => state.typeOrder.indexOf(a) - state.typeOrder.indexOf(b));
}
function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}
function pageTitle(kicker, title) { return `<div class="page-title"><small>${esc(kicker)}</small><h1>${esc(title)}</h1></div>`; }
function avatarMarkup(value) { const avatar = safeAvatar(value); return avatar.startsWith("data:image/") ? `<img src="${esc(avatar)}" alt="个人头像">` : `<span>${esc(avatar)}</span>`; }

function metricCard(type) {
  const meta = getMeta(type);
  const entry = latest(type);
  const display = displayEntry(entry, meta);
  const className = TYPES[type] ? type : "custom";
  return `<article class="card ${className}"><div class="card-top"><span class="card-icon">${esc(meta.icon)}</span></div><span class="kicker">${esc(meta.label)}${type === "meal" ? " · 自动估算" : ""}</span><div class="metric-value ${["text", "boolean"].includes(meta.kind) ? "words" : ""}"><strong>${esc(display.value)}</strong><span> ${esc(display.unit)}</span></div><div class="card-meta">${esc(display.detail)}</div></article>`;
}

function renderToday() {
  const todayEntries = state.entries.filter((entry) => isToday(entry.recordedAt));
  const score = Math.min(96, 70 + todayEntries.length * 4);
  screen.innerHTML = `${pageTitle(new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date()), `把${state.profile.nickname}养成健健康康的小猪`)}
    <section class="hero"><span class="kicker">今日状态</span><div class="score">${score}<span> / 100</span></div><h2>${todayEntries.length ? "今天也在好好照顾自己 🌟" : "从一条小记录开始吧 🌼"}</h2><p>${todayEntries.length ? `已经记录了 ${todayEntries.length} 件健康小事，慢慢积累就很棒。` : "睡眠、餐食、运动和喝水，都可以轻轻松松记下来。"}</p><div class="badges"><span>🌱 本机私密保存</span><span>🎙️ 支持语音</span></div></section>
    <div class="section-heading"><div><span class="kicker">今日记录</span><h2>今天照顾了这些</h2></div></div>
    <section class="metric-grid">${enabledTypes().map(metricCard).join("")}</section>
    ${!todayEntries.length ? '<div class="empty-note">点击右上角的 ＋，记下今天第一件健康小事吧</div>' : ""}`;
  bindScreen();
}

function lastDays(count = 7) { return Array.from({ length: count }, (_, index) => { const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - (count - 1 - index)); return date; }); }
function entriesForDay(type, date) { return state.entries.filter((entry) => entry.type === type && new Date(entry.recordedAt).toDateString() === date.toDateString()); }
function aggregate(entries, meta) { if (!entries.length) return 0; if (meta.kind === "rating") return entries.reduce((sum, entry) => sum + Number(entry.value || 0), 0) / entries.length; if (meta.kind === "boolean") return Math.max(...entries.map((entry) => Number(entry.value || 0))); if (meta.kind === "text") return entries.length; return entries.reduce((sum, entry) => sum + Number(entry.value || 0), 0); }
function dailyValue(type, date) { return aggregate(entriesForDay(type, date), getMeta(type)); }
function displayEntry(entry, meta) { if (!entry) return { value: "—", unit: meta.kind === "text" ? "" : meta.unit, detail: "今天还没有记录" }; if (meta.kind === "boolean") return { value: entry.value ? "已完成" : "未完成", unit: "", detail: entry.note || "已记录状态" }; if (meta.kind === "rating") return { value: entry.value, unit: `/ ${meta.ratingMax || 5} 分`, detail: entry.note || "已记录评分" }; if (meta.kind === "text") return { value: "已记录", unit: "", detail: entry.note || "已写下当天感受" }; return { value: entry.value, unit: entry.unit || meta.unit, detail: entry.note || "已记录" }; }
function kindLabel(kind) { return ({ number: "数值", boolean: "完成状态", count: "次数", duration: "时长", rating: "评分", text: "文字" })[kind] || "数值"; }
function directionLabel(direction) { return direction === "more" ? "越多越接近目标" : direction === "less" ? "越少越好" : "只观察变化"; }
function meetsGoal(value, hasEntries, meta) { if (!hasEntries || meta.goal === undefined || meta.direction === "neutral") return false; return meta.direction === "less" ? value <= meta.goal : value >= meta.goal; }
function streakFor(rows, meta) { let streak = 0; for (const row of [...rows].reverse()) { if (meetsGoal(row.value, row.entries.length > 0, meta)) streak += 1; else break; } return streak; }
function trendMessage(values, meta) { const present = values.filter((value) => value > 0); if (present.length < 2) return "记录多一点后，会更容易看出变化"; const half = Math.max(1, Math.floor(present.length / 2)); const earlier = present.slice(0, half).reduce((sum, value) => sum + value, 0) / half; const recentValues = present.slice(half); const recent = recentValues.reduce((sum, value) => sum + value, 0) / Math.max(1, recentValues.length); const delta = recent - earlier; if (Math.abs(delta) < Math.max(.1, Math.abs(earlier) * .05)) return "最近比较平稳，按自己的节奏继续就好"; if (meta.direction === "neutral") return delta > 0 ? "最近略有上升，可结合备注看看原因" : "最近略有下降，可结合备注看看原因"; const improving = meta.direction === "less" ? delta < 0 : delta > 0; return improving ? "最近更接近目标了，轻松保持就好" : "最近有些波动，不必有压力"; }
function goalExplanation(meta) { if (meta.direction === "less") return meta.goal === undefined ? "↓ 曲线向下代表数值减少" : `↓ 曲线向下代表改善 · 每天不超过 ${meta.goal} ${meta.unit}`; if (meta.direction === "more") return meta.goal === undefined ? "↑ 曲线向上代表更接近目标" : `↑ 越接近 ${meta.goal} ${meta.unit} 越好`; return "观察变化，不判断好坏"; }
function curvePath(points) { if (!points.length) return ""; if (points.length === 1) return `M ${points[0].x} ${points[0].y}`; return points.slice(1).reduce((path, point, index) => { const previous = points[index]; const middle = (previous.x + point.x) / 2; return `${path} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`; }, `M ${points[0].x} ${points[0].y}`); }
function bucketSeries(days, values, hasEntries) { const size = trendDays === 90 ? 3 : 1; return Array.from({ length: Math.ceil(days.length / size) }, (_, index) => { const groupDays = days.slice(index * size, index * size + size); const groupValues = values.slice(index * size, index * size + size); const groupRecorded = hasEntries.slice(index * size, index * size + size); const recordedValues = groupValues.filter((value, valueIndex) => groupRecorded[valueIndex]); return { day: groupDays[groupDays.length - 1], value: recordedValues.length ? recordedValues.reduce((sum, value) => sum + value, 0) / recordedValues.length : null, note: groupDays.map((day) => state.dayNotes[localDayKey(day)]).find(Boolean) || "" }; }); }
function curveMarkup(days, values, hasEntries, meta, compact = false) { const buckets = bucketSeries(days, values, hasEntries); const width = compact ? 120 : 600; const height = compact ? 38 : 178; const top = compact ? 4 : 16; const bottom = compact ? 4 : 24; const max = Math.max(1, meta.goal || 0, ...buckets.map((bucket) => bucket.value || 0)); const points = buckets.map((bucket, index) => bucket.value === null ? null : ({ x: buckets.length === 1 ? width / 2 : (compact ? 0 : 18) + index / (buckets.length - 1) * (width - (compact ? 0 : 36)), y: top + (1 - bucket.value / max) * (height - top - bottom), ...bucket })).filter(Boolean); if (compact) return `<span class="mini-curve"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><path d="${curvePath(points)}" vector-effect="non-scaling-stroke"></path></svg></span>`; const targetY = meta.goal === undefined ? null : top + (1 - Math.min(1, meta.goal / max)) * (height - top - bottom); const labelCount = Math.min(7, buckets.length); const labelIndexes = [...new Set(Array.from({ length: labelCount }, (_, index) => Math.round(index * (buckets.length - 1) / Math.max(1, labelCount - 1))))]; return `<div class="curve-chart ${meta.direction || "neutral"}" role="img" aria-label="${esc(meta.label || "记录")}曲线趋势"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${targetY === null ? "" : `<line class="curve-goal-line" x1="18" x2="${width - 18}" y1="${targetY}" y2="${targetY}"></line><text class="curve-goal-label" x="${width - 20}" y="${Math.max(12, targetY - 5)}" text-anchor="end">目标 ${meta.goal} ${esc(meta.unit)}</text>`}<path class="curve-path" d="${curvePath(points)}" vector-effect="non-scaling-stroke"></path>${points.map((point) => `<circle class="curve-dot ${meetsGoal(point.value, true, meta) ? "met" : ""}" cx="${point.x}" cy="${point.y}" r="${point.note ? 5 : 3.5}"></circle>`).join("")}</svg><div class="curve-labels">${labelIndexes.map((index) => `<span>${index === buckets.length - 1 ? "今" : `${buckets[index].day.getMonth() + 1}/${buckets[index].day.getDate()}`}</span>`).join("")}</div>${trendDays === 90 ? '<small class="curve-sampling">90 天按每 3 天汇总一个点，共 30 个点</small>' : ""}</div>`; }
function rangeSwitch() { return `<div class="range-switch">${[7, 30, 90].map((days) => `<button data-range="${days}" class="${trendDays === days ? "active" : ""}">${days === 90 ? "3 个月" : `${days} 天`}</button>`).join("")}</div>`; }
function bindRange(rerender) { screen.querySelectorAll("[data-range]").forEach((button) => button.onclick = () => { trendDays = Number(button.dataset.range); rerender(); }); }
function renderTrends() {
  const days = lastDays(trendDays);
  const counts = days.map((date) => state.entries.filter((entry) => new Date(entry.recordedAt).toDateString() === date.toDateString()).length);
  const trendTypes = enabledTypes();
  screen.innerHTML = `${pageTitle(`近 ${trendDays === 90 ? "3 个月" : `${trendDays} 天`}健康趋势`, "一起看看最近的小变化")}${rangeSwitch()}
    <div class="summary-grid"><article class="summary-card"><span>📅</span><small>有记录天数</small><strong>${counts.filter(Boolean).length}</strong></article><article class="summary-card"><span>🌼</span><small>${trendDays === 90 ? "近 3 个月记录" : `近 ${trendDays} 天记录`}</small><strong>${counts.reduce((sum, value) => sum + value, 0)}</strong></article></div>
    ${curveMarkup(days, counts, counts.map((count) => count > 0), { label: "记录次数", unit: "次", direction: "neutral" })}
    <div class="section-heading trend-heading"><div><span class="kicker">按项目查看</span><h2>每一种习惯的变化</h2></div><small>点击查看每日明细</small></div>
    <section class="trend-project-list">${trendTypes.map((type) => { const meta = getMeta(type); const values = days.map((day) => dailyValue(type, day)); const hasEntries = days.map((day) => entriesForDay(type, day).length > 0); return `<button class="trend-project" data-trend-type="${esc(type)}"><span class="trend-project-icon">${esc(meta.icon)}</span><span class="trend-project-copy"><strong>${esc(meta.label)}</strong><small>${esc(goalExplanation(meta))} · ${esc(trendMessage(values, meta))}</small></span>${curveMarkup(days, values, hasEntries, meta, true)}</button>`; }).join("")}</section>
    <button class="history-shortcut" id="open-history"><span>🕰️</span><div><strong>全部历史记录</strong><small>${state.entries.length} 条 · 可以修改或删除</small></div><i>→</i></button>
    <div class="empty-note">自定义习惯也会自动出现在这里 🐷</div>`;
  screen.querySelectorAll("[data-trend-type]").forEach((button) => button.onclick = () => { trendDetailType = button.dataset.trendType; renderTrendDetail(trendDetailType); });
  document.querySelector("#open-history").onclick = renderHistory;
  bindRange(renderTrends);
}

function renderHistory() {
  const entries = [...state.entries].sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));
  screen.innerHTML = `<button class="back-button" id="back-history">‹ 返回趋势</button>${pageTitle("本机记录", "全部历史记录")}
    <section class="history-list">${entries.length ? entries.map((entry) => { const meta = getMeta(entry.type); const display = displayEntry(entry, meta); return `<article><span>${esc(meta.icon)}</span><div><strong>${esc(meta.label)} · ${esc(display.value)} ${esc(display.unit)}</strong><time>${new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(entry.recordedAt))}</time><small>${esc(entry.note) || "没有备注"}</small></div><div class="history-actions"><button data-edit-entry="${entry.id}">编辑</button><button data-delete-entry="${entry.id}">删除</button></div></article>`; }).join("") : '<div class="empty-note">还没有历史记录，先去“今天”记一笔吧。</div>'}</section>`;
  document.querySelector("#back-history").onclick = renderTrends;
  screen.querySelectorAll("[data-edit-entry]").forEach((button) => button.onclick = () => openEntryDialog(Number(button.dataset.editEntry)));
  screen.querySelectorAll("[data-delete-entry]").forEach((button) => button.onclick = () => { const id = Number(button.dataset.deleteEntry); if (!confirm("删除这条历史记录吗？")) return; state.entries = state.entries.filter((entry) => entry.id !== id); saveState(); showToast("记录已删除"); renderHistory(); });
}

function renderTrendDetail(type) {
  const meta = getMeta(type);
  const days = lastDays(trendDays);
  const values = days.map((day) => dailyValue(type, day));
  const total = values.reduce((sum, value) => sum + value, 0);
  const rows = days.map((day, index) => ({ day, entries: entriesForDay(type, day), value: values[index] }));
  const streak = streakFor(rows, meta);
  screen.innerHTML = `<div class="detail-topline"><button class="back-button" id="back-trends">‹ 返回全部趋势</button>${rangeSwitch()}</div>${pageTitle(`近 ${trendDays === 90 ? "3 个月" : `${trendDays} 天`}每日变化`, `${meta.icon} ${meta.label}`)}
    <section class="detail-chart"><div class="detail-chart-title"><span>${esc(trendMessage(values, meta))}</span><strong>${Number.isInteger(total) ? total : total.toFixed(1)} <small>${esc(meta.kind === "text" ? "条" : meta.unit)}</small></strong></div>${meta.direction !== "neutral" ? `<div class="goal-summary ${meta.direction}"><strong>${meta.direction === "less" ? "↓ 越低越好" : "↑ 越高越接近目标"}</strong><span>${esc(goalExplanation(meta))}</span>${streak ? `<small>轻松连续达标 ${streak} 天 🌱</small>` : ""}</div>` : ""}${curveMarkup(days, values, rows.map((row) => row.entries.length > 0), meta)}</section>
    <section class="daily-list">${rows.slice().reverse().map((row) => { const key = localDayKey(row.day); const display = !row.entries.length ? "没有记录" : meta.kind === "boolean" ? (row.value ? "已完成" : "未完成") : meta.kind === "rating" ? `${row.value.toFixed(1)} / ${meta.ratingMax || 5} 分` : meta.kind === "text" ? `${row.entries.length} 条文字记录` : `${Number(row.value.toFixed(1))} ${esc(meta.unit)}`; return `<article><time>${new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", weekday: "short" }).format(row.day)}</time><div><strong>${display}</strong><small>${row.entries.length ? row.entries.map((entry) => esc(entry.note) || new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(entry.recordedAt))).join(" · ") : "—"}</small>${state.dayNotes[key] ? `<p>🏷️ ${esc(state.dayNotes[key])}</p>` : ""}</div><button data-day-note="${key}">${state.dayNotes[key] ? "修改备注" : "＋ 日期备注"}</button></article>`; }).join("")}</section>
    `;
  document.querySelector("#back-trends").onclick = () => { trendDetailType = null; renderTrends(); };
  screen.querySelectorAll("[data-day-note]").forEach((button) => button.onclick = () => openDayNote(button.dataset.dayNote));
  bindRange(() => renderTrendDetail(type));
}

function renderPlans() {
  const due = state.plans.filter(planAppliesToday);
  const done = due.filter(planDoneToday).length;
  screen.innerHTML = `${pageTitle("今日计划", "自己的目标，自己来安排")}
    <div class="plan-list">${state.plans.map((plan, index) => { const applies = planAppliesToday(plan); const doneToday = planDoneToday(plan); return `<article class="plan-row ${doneToday ? "done" : ""} ${applies ? "" : "not-due"}"><span>${esc(plan.icon)}</span><div><h3>${esc(plan.title)}</h3><p>${esc(plan.detail) || "给自己一个小小目标"}</p><small class="repeat-badge">${repeatLabel(plan.repeat)} · ${applies ? "今日计划" : "今天不安排"}</small></div><div class="plan-actions"><button data-check-plan="${index}" ${applies ? "" : "disabled"} aria-label="切换今天完成状态">${doneToday ? "✓" : ""}</button><button data-edit-plan="${index}" aria-label="编辑计划">✎</button></div></article>`; }).join("")}</div>
    <button class="add-plan" id="add-plan"><span>＋</span> 增加一项新计划</button>
    <div class="empty-note">今日完成 ${done} / ${due.length} 项 · 第二天会自动重新开始</div>`;
  screen.querySelectorAll("[data-check-plan]").forEach((button) => button.onclick = () => { const plan = state.plans[Number(button.dataset.checkPlan)]; if (!planAppliesToday(plan)) return; const key = localDayKey(); plan.completedDates = plan.completedDates.includes(key) ? plan.completedDates.filter((date) => date !== key) : [...plan.completedDates, key]; saveState(); renderPlans(); });
  screen.querySelectorAll("[data-edit-plan]").forEach((button) => button.onclick = () => openPlanDialog(Number(button.dataset.editPlan)));
  document.querySelector("#add-plan").onclick = () => openPlanDialog(-1);
}

function renderProfile() {
  const optionalTypes = ["smoking", "alcohol"].filter((type) => !state.removedBuiltins.includes(type));
  const habitCount = optionalTypes.length + state.customHabits.length;
  screen.innerHTML = `${pageTitle("个人资料与记录设置", "我的健康小空间")}
    <section class="hero profile-hero"><button class="big-avatar" id="change-avatar" aria-label="更换头像">${avatarMarkup(state.profile.avatar)}<i>✎</i></button><div class="profile-name-wrap"><span class="kicker">点击头像或名字直接修改</span><input id="profile-name" maxlength="20" value="${esc(state.profile.nickname)}" aria-label="昵称"><p>这里是你的个人健康空间</p></div></section>
    <details class="habit-settings"><summary><span>🧩</span><div><strong>我的习惯</strong><small>${habitCount} 个可选习惯 · 支持多种记录类型</small></div><i>⌄</i></summary><div class="habit-settings-body"><p>可添加完成状态、次数、时长、评分、文字或普通数值；还可以设置越多越好或越少越好。</p><div class="core-habit-list">${["sleep", "meal", "exercise", "water"].map((type) => `<span>${TYPES[type].icon} ${TYPES[type].label}<small>基础项目</small></span>`).join("")}</div><div class="optional-habit-list">${optionalTypes.map((type) => `<div><span class="optional-habit-icon">${TYPES[type].icon}</span><div><strong>${TYPES[type].label}</strong><small>${kindLabel(TYPES[type].kind)} · 越少越好</small></div><button class="habit-visibility ${state.visible.includes(type) ? "active" : ""}" data-toggle="${type}">${state.visible.includes(type) ? "已展示" : "不展示"}</button><button class="habit-delete" data-remove-builtin="${type}" aria-label="删除${TYPES[type].label}">×</button></div>`).join("")}</div><div class="custom-habit-list">${state.customHabits.map((habit) => `<div><span>${esc(habit.icon)}</span><strong>${esc(habit.name)}</strong><small>${esc(kindLabel(habit.kind))} · ${esc(directionLabel(habit.direction))}</small><button data-remove-habit="${esc(habit.id)}" aria-label="删除${esc(habit.name)}">×</button></div>`).join("")}</div><button class="add-habit" id="add-habit">＋ 添加自己想记录的习惯</button></div></details>
    <section class="goal-grid">${["sleep", "exercise", "water"].map((type) => `<article><span>${TYPES[type].icon}</span><small>${TYPES[type].label}目标</small><strong>${state.goals[type]} ${TYPES[type].unit}</strong><button data-goal="${type}">修改目标</button></article>`).join("")}</section>
    <details class="habit-settings utility-settings"><summary><span>⚙️</span><div><strong>设置</strong><small>显示顺序、备份与隐私</small></div><i>⌄</i></summary><div class="habit-settings-body utility-settings-body"><section class="habit-sort-card compact-setting"><div><span>⠿</span><div><strong>显示顺序</strong><small>按住移动按钮上下拖动</small></div></div><div class="habit-sort-list">${enabledTypes().map((type) => { const meta = getMeta(type); return `<div data-sort-type="${esc(type)}"><button class="drag-handle" data-drag-handle="${esc(type)}" aria-label="按住拖动${esc(meta.label)}">⠿</button><span>${esc(meta.icon)}</span><strong>${esc(meta.label)}</strong><small>${esc(kindLabel(meta.kind))}</small></div>`; }).join("")}</div></section><section class="backup-card compact-setting"><div><span>🧳</span><div><strong>本地数据备份</strong><small>保存到手机文件，之后可以恢复全部记录</small>${state.lastBackupAt ? `<small>最近备份：${new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(state.lastBackupAt))}</small>` : ""}</div></div><div><button id="export-backup">导出备份</button><button id="import-backup">恢复备份</button></div></section><div class="privacy compact-setting">🔒 仅保存在当前设备，不会上传健康记录；备份也只由你手动保存和恢复。收到新版 APK 时请直接覆盖安装，不要先卸载。</div></div></details>`;
  document.querySelector("#change-avatar").onclick = openAvatarDialog;
  document.querySelector("#profile-name").addEventListener("change", (event) => { state.profile.nickname = event.target.value.trim() || "宝宝"; event.target.value = state.profile.nickname; saveState(); showToast("昵称保存好啦 🌸"); });
  screen.querySelectorAll("[data-toggle]").forEach((button) => button.onclick = () => { const type = button.dataset.toggle; state.visible = state.visible.includes(type) ? state.visible.filter((item) => item !== type) : [...state.visible, type]; saveState(); renderProfile(); });
  screen.querySelectorAll("[data-remove-builtin]").forEach((button) => button.onclick = () => { const type = button.dataset.removeBuiltin; if (!confirm(`删除${TYPES[type].label}这个习惯？以前的记录仍会保留。`)) return; state.removedBuiltins = [...new Set([...state.removedBuiltins, type])]; state.visible = state.visible.filter((item) => item !== type); saveState(); renderProfile(); });
  screen.querySelectorAll("[data-remove-habit]").forEach((button) => button.onclick = () => { const id = button.dataset.removeHabit; if (!confirm("删除这个记录项目？以前的记录仍会保留。")) return; state.customHabits = state.customHabits.filter((habit) => habit.id !== id); state.typeOrder = state.typeOrder.filter((type) => type !== id); saveState(); renderProfile(); });
  screen.querySelectorAll("[data-goal]").forEach((button) => button.onclick = () => openGoalDialog(button.dataset.goal));
  document.querySelector("#add-habit").onclick = () => document.querySelector("#habit-dialog").showModal();
  document.querySelector("#export-backup").onclick = exportBackup;
  document.querySelector("#import-backup").onclick = importBackup;
  const sortList = screen.querySelector(".habit-sort-list");
  const commitOrder = () => { const visibleOrder = [...sortList.querySelectorAll("[data-sort-type]")].map((row) => row.dataset.sortType); const visibleSet = new Set(visibleOrder); let visibleIndex = 0; state.typeOrder = state.typeOrder.map((type) => visibleSet.has(type) ? visibleOrder[visibleIndex++] : type); saveState(); };
  sortList.querySelectorAll("[data-drag-handle]").forEach((handle) => {
    let row = handle.closest("[data-sort-type]");
    handle.onpointerdown = (event) => { row = handle.closest("[data-sort-type]"); row.classList.add("dragging"); handle.setPointerCapture(event.pointerId); };
    handle.onpointermove = (event) => { if (!handle.hasPointerCapture(event.pointerId)) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-sort-type]"); if (!target || target === row || target.parentElement !== sortList) return; const rect = target.getBoundingClientRect(); if (event.clientY > rect.top + rect.height / 2) target.after(row); else target.before(row); };
    handle.onpointerup = handle.onpointercancel = () => { row.classList.remove("dragging"); commitOrder(); };
    handle.onkeydown = (event) => { if (!["ArrowUp", "ArrowDown"].includes(event.key)) return; event.preventDefault(); const target = event.key === "ArrowUp" ? row.previousElementSibling : row.nextElementSibling; if (!target) return; if (event.key === "ArrowUp") target.before(row); else target.after(row); commitOrder(); };
  });
}

function render() {
  document.querySelectorAll(".bottom-nav button").forEach((button) => button.classList.toggle("active", button.dataset.nav === view));
  if (view === "trends" && trendDetailType) renderTrendDetail(trendDetailType);
  else ({ today: renderToday, trends: renderTrends, plans: renderPlans, profile: renderProfile })[view]();
  updateNotificationDot();
}
function bindScreen() {
  screen.querySelectorAll("[data-record]").forEach((button) => button.onclick = () => openRecord(button.dataset.record));
  screen.querySelectorAll("[data-nav]").forEach((button) => button.onclick = () => navigate(button.dataset.nav));
}
function navigate(next) { if (next !== "trends" || view === next) trendDetailType = null; view = next; window.scrollTo(0, 0); render(); }

function openRecord(type = "exercise") {
  recordType = type;
  document.querySelector("#record-time").value = nowLocal();
  document.querySelector("#record-note").value = "";
  renderRecordForm();
  recordDialog.showModal();
}
function renderRecordForm() {
  tabs.innerHTML = enabledTypes().map((type) => `<button type="button" data-type="${esc(type)}" class="${type === recordType ? "active" : ""}">${esc(getMeta(type).label)}</button>`).join("");
  tabs.querySelectorAll("button").forEach((button) => button.onclick = () => { recordType = button.dataset.type; renderRecordForm(); });
  const meta = getMeta(recordType);
  if (recordType === "meal") {
    fields.innerHTML = `<label><span>吃了什么</span><div class="voice-row"><input id="meal-name" placeholder="例如：鸡胸肉沙拉" required><button type="button" class="voice-button" data-voice="meal-name">🎙️ 说一说</button></div></label><label><span>大概分量</span><div class="portion-row"><input id="portion-amount" type="number" min="0.1" step="0.1" value="1"><select id="portion-unit"><option>份</option><option>碗</option><option>个</option><option>克</option><option>毫升</option></select></div></label><div class="calorie-box"><span>✨ 自动估算</span><strong id="calorie-value">约 300 千卡</strong><small>根据常见食材和分量粗略估算，仅供日常参考</small></div>`;
    ["meal-name", "portion-amount", "portion-unit"].forEach((id) => document.querySelector(`#${id}`).addEventListener("input", updateCalories));
  } else if (meta.kind === "boolean") fields.innerHTML = `<label><span>完成状态</span><select id="record-value"><option value="1">已完成</option><option value="0">未完成</option></select></label>`;
  else if (meta.kind === "rating") fields.innerHTML = `<label><span>${esc(meta.label)}评分</span><div class="value-row"><input id="record-value" type="number" min="1" max="${meta.ratingMax || 5}" step="1" value="3" required><em>/ ${meta.ratingMax || 5} 分</em></div></label>`;
  else if (meta.kind === "text") fields.innerHTML = `<label><span>写下${esc(meta.label)}</span><div class="voice-row text-record"><textarea id="text-record-value" placeholder="记录今天的身体感受或备注" required></textarea><button type="button" class="voice-button" data-voice="text-record-value">🎙️ 说一说</button></div></label>`;
  else fields.innerHTML = `<label><span>${esc(meta.label)}${meta.kind === "duration" ? "时长" : "数量"}</span><div class="value-row"><input id="record-value" type="number" min="0" step="${recordType === "sleep" ? "0.1" : "1"}" value="${meta.value}" required><em>${esc(meta.unit)}</em></div></label>`;
  document.querySelector("#record-note-wrap").hidden = meta.kind === "text";
  bindVoiceButtons();
}
function estimate(food, amount, unit) { return window.ShengxiParser.estimate(food, amount, unit); }
function updateCalories() {
  const food = document.querySelector("#meal-name")?.value || "";
  const amount = Number(document.querySelector("#portion-amount")?.value || 0);
  const unit = document.querySelector("#portion-unit")?.value || "份";
  document.querySelector("#calorie-value").textContent = `约 ${estimate(food, amount, unit)} 千卡`;
}

function openPlanDialog(index) {
  editingPlanIndex = index;
  const plan = index >= 0 ? state.plans[index] : { icon: "🌱", title: "", detail: "" };
  document.querySelector("#plan-dialog-title").textContent = index >= 0 ? "调整计划" : "新增计划";
  document.querySelector("#plan-icon").value = plan.icon;
  document.querySelector("#plan-title").value = plan.title;
  document.querySelector("#plan-detail").value = plan.detail;
  document.querySelector("#plan-repeat").value = plan.repeat || "daily";
  document.querySelector("#delete-plan").style.display = index >= 0 ? "block" : "none";
  document.querySelector("#plan-dialog").showModal();
}

function openEntryDialog(id) {
  const entry = state.entries.find((item) => item.id === id);
  if (!entry) return;
  editingEntryId = id;
  const select = document.querySelector("#entry-type");
  const types = [...new Set([...enabledTypes(), entry.type])];
  select.innerHTML = types.map((type) => `<option value="${esc(type)}">${esc(getMeta(type).label)}</option>`).join("");
  select.value = entry.type;
  renderEntryValueField(entry.type, entry.value);
  document.querySelector("#entry-time").value = nowLocalFrom(entry.recordedAt);
  document.querySelector("#entry-note").value = entry.note || "";
  document.querySelector("#entry-dialog").showModal();
}
function renderEntryValueField(type, value) {
  const meta = getMeta(type); const box = document.querySelector("#entry-value-fields");
  if (meta.kind === "text") box.innerHTML = "";
  else if (meta.kind === "boolean") box.innerHTML = `<label><span>完成状态</span><select id="entry-value"><option value="1" ${value ? "selected" : ""}>已完成</option><option value="0" ${value ? "" : "selected"}>未完成</option></select></label>`;
  else box.innerHTML = `<label><span>${meta.kind === "rating" ? "评分" : "数值"}</span><div class="value-row"><input id="entry-value" type="number" min="${meta.kind === "rating" ? 1 : 0}" ${meta.kind === "rating" ? `max="${meta.ratingMax || 5}"` : ""} step="0.1" value="${Number(value || 0)}" required><em>${meta.kind === "rating" ? `/ ${meta.ratingMax || 5} 分` : esc(meta.unit)}</em></div></label>`;
  document.querySelector("#entry-note").required = meta.kind === "text";
}

function nowLocalFrom(value) { const date = new Date(value); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); }

function buildBackup() {
  const exportedAt = new Date().toISOString();
  state.lastBackupAt = exportedAt;
  saveState();
  return JSON.stringify({ format: "healthy-pig-backup", version: 5, exportedAt, data: state }, null, 2);
}
function exportBackup() {
  const json = buildBackup();
  const filename = `健康小猪备份-${localDayKey()}.json`;
  if (window.AndroidMedia?.exportBackup) window.AndroidMedia.exportBackup(json, filename);
  else {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = filename; link.style.display = "none"; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  showToast("备份文件已保存到本机 🔒");
  if (view === "profile") renderProfile();
}
function importBackup() {
  if (window.AndroidMedia?.importBackup) window.AndroidMedia.importBackup();
  else document.querySelector("#backup-file").click();
}
function restoreBackupText(text) {
  try {
    if (typeof text !== "string" || text.length > 10_000_000) throw new Error("invalid");
    const parsed = JSON.parse(text);
    if (!isRecord(parsed) || parsed.format !== "healthy-pig-backup" || !isRecord(parsed.data)) throw new Error("invalid");
    if (!confirm("恢复备份会用备份内容替换当前手机的数据，确定继续吗？")) return;
    state = normalizeState(parsed.data); state.lastBackupAt = new Date().toISOString(); saveState(); view = "today"; render(); showToast("备份已恢复，记录都回来啦 🌼");
  } catch { showToast("没有识别到有效的健康小猪备份文件"); }
}
window.__shengxiBackupImported = restoreBackupText;
window.__shengxiBackupMessage = (message) => showToast(message);

function openGoalDialog(type) {
  editingGoalType = type;
  const meta = TYPES[type];
  document.querySelector("#goal-dialog-title").textContent = `修改${meta.label}目标`;
  document.querySelector("#goal-value").value = state.goals[type];
  document.querySelector("#goal-unit").textContent = meta.unit;
  document.querySelector("#goal-dialog").showModal();
}

function openDayNote(dateKey) {
  editingDayNoteKey = dateKey;
  document.querySelector("#day-note-title").textContent = `${dateKey} 的备注`;
  document.querySelector("#day-note-text").value = state.dayNotes[dateKey] || "";
  document.querySelector("#clear-day-note").style.display = state.dayNotes[dateKey] ? "block" : "none";
  document.querySelector("#day-note-dialog").showModal();
}

function openAvatarDialog() {
  const picker = document.querySelector("#dialog-avatar-picker");
  picker.innerHTML = AVATARS.map((avatar) => `<button class="${avatar === state.profile.avatar ? "active" : ""}" data-avatar="${avatar}">${avatar}</button>`).join("");
  picker.querySelectorAll("[data-avatar]").forEach((button) => button.onclick = () => { state.profile.avatar = button.dataset.avatar; saveState(); document.querySelector("#avatar-dialog").close(); renderProfile(); showToast("头像换好啦 ✨"); });
  document.querySelector("#avatar-dialog").showModal();
}
window.__shengxiAvatarSelected = (dataUrl) => {
  const avatar = safeAvatar(dataUrl, "");
  if (!avatar) return showToast("没有识别到安全的照片头像");
  state.profile.avatar = avatar;
  saveState();
  document.querySelector("#avatar-dialog").close();
  if (view === "profile") renderProfile();
  showToast("照片头像保存好啦 📷");
};

function parseNatural(text) { return window.ShengxiParser.parse(text, state.customHabits); }
function openSmartDialog() {
  smartResults = [];
  document.querySelector("#smart-text").value = "";
  document.querySelector("#smart-preview").innerHTML = "";
  document.querySelector("#confirm-smart").disabled = true;
  document.querySelector("#smart-dialog").showModal();
  bindVoiceButtons();
}
function analyzeSmartText() {
  const text = document.querySelector("#smart-text").value.trim();
  smartResults = parseNatural(text);
  const preview = document.querySelector("#smart-preview");
  document.querySelector("#confirm-smart").disabled = smartResults.length === 0;
  preview.innerHTML = smartResults.length
    ? `<span class="kicker">识别到 ${smartResults.length} 项 · 保存前可修改</span><div class="smart-edit-list">${smartResults.map((entry, index) => smartEditMarkup(entry, index)).join("")}</div>`
    : `<div class="smart-empty">还没识别出记录。可以试着带上数字和单位，例如“散步 30 分钟”。</div>`;
  bindSmartEditors();
}

function smartEditMarkup(entry, index) {
  const types = [...new Set([...enabledTypes(), entry.type])];
  return `<article><div class="smart-edit-heading"><span>${esc(getMeta(entry.type).icon)}</span><strong>检查这条记录</strong><button data-smart-delete="${index}">删除</button></div><label><span>项目</span><select data-smart-type="${index}">${types.map((type) => `<option value="${esc(type)}" ${type === entry.type ? "selected" : ""}>${esc(getMeta(type).label)}</option>`).join("")}</select></label><label><span>数值</span><div class="value-row"><input data-smart-value="${index}" type="number" min="0" step="0.1" value="${Number(entry.value) || 0}"><em>${esc(entry.unit)}</em></div></label><label><span>记录时间</span><input data-smart-time="${index}" type="datetime-local" value="${esc(nowLocalFrom(entry.recordedAt))}"></label><label><span>备注</span><input data-smart-note="${index}" value="${esc(entry.note)}"></label></article>`;
}
function bindSmartEditors() {
  const preview = document.querySelector("#smart-preview");
  preview.querySelectorAll("[data-smart-delete]").forEach((button) => button.onclick = () => { smartResults.splice(Number(button.dataset.smartDelete), 1); document.querySelector("#confirm-smart").disabled = !smartResults.length; document.querySelector("#smart-preview").innerHTML = smartResults.length ? `<span class="kicker">识别到 ${smartResults.length} 项 · 保存前可修改</span><div class="smart-edit-list">${smartResults.map((entry, index) => smartEditMarkup(entry, index)).join("")}</div>` : '<div class="smart-empty">已删除全部识别结果。</div>'; bindSmartEditors(); });
  preview.querySelectorAll("[data-smart-type]").forEach((input) => input.onchange = () => { const entry = smartResults[Number(input.dataset.smartType)]; entry.type = input.value; entry.unit = getMeta(input.value).unit; analyzeSmartPreviewOnly(); });
  preview.querySelectorAll("[data-smart-value]").forEach((input) => input.oninput = () => { smartResults[Number(input.dataset.smartValue)].value = Number(input.value); });
  preview.querySelectorAll("[data-smart-time]").forEach((input) => input.oninput = () => { smartResults[Number(input.dataset.smartTime)].recordedAt = new Date(input.value).toISOString(); });
  preview.querySelectorAll("[data-smart-note]").forEach((input) => input.oninput = () => { smartResults[Number(input.dataset.smartNote)].note = input.value; });
}
function analyzeSmartPreviewOnly() { const preview = document.querySelector("#smart-preview"); preview.innerHTML = `<span class="kicker">识别到 ${smartResults.length} 项 · 保存前可修改</span><div class="smart-edit-list">${smartResults.map((entry, index) => smartEditMarkup(entry, index)).join("")}</div>`; bindSmartEditors(); }

function buildNotifications() {
  const items = [];
  if (!latest("water")) items.push({ icon: "💧", title: "今天还没记录喝水", detail: "喝一小杯，也算认真照顾自己。", type: "water" });
  if (!latest("exercise")) items.push({ icon: "🌱", title: "起来伸伸懒腰吧", detail: "散步十分钟也很好。", type: "exercise" });
  const undone = state.plans.filter((plan) => planAppliesToday(plan) && !planDoneToday(plan)).length;
  if (undone) items.push({ icon: "📝", title: `还有 ${undone} 项计划可以完成`, detail: "不着急，按自己的节奏来。", view: "plans" });
  if (!items.length) items.push({ icon: "🌼", title: "今天完成得很棒", detail: "所有提醒都照顾到了。" });
  return items;
}
function updateNotificationDot() { document.querySelector("#notification-dot").hidden = state.notificationsSeen; }
function openNotifications() {
  state.notificationsSeen = true;
  saveState();
  updateNotificationDot();
  const list = document.querySelector("#notification-list");
  list.innerHTML = buildNotifications().map((item) => `<button class="notification-item" ${item.type ? `data-notify-record="${item.type}"` : ""} ${item.view ? `data-notify-view="${item.view}"` : ""}><span>${item.icon}</span><div><strong>${item.title}</strong><small>${item.detail}</small></div><i>${item.type || item.view ? "→" : "✓"}</i></button>`).join("");
  list.querySelectorAll("[data-notify-record]").forEach((button) => button.onclick = () => { document.querySelector("#notification-dialog").close(); openRecord(button.dataset.notifyRecord); });
  list.querySelectorAll("[data-notify-view]").forEach((button) => button.onclick = () => { document.querySelector("#notification-dialog").close(); navigate(button.dataset.notifyView); });
  document.querySelector("#notification-dialog").showModal();
}

function bindVoiceButtons() {
  document.querySelectorAll("[data-voice]").forEach((button) => button.onclick = () => voiceTo(document.querySelector(`#${button.dataset.voice}`), button));
}
function voiceTo(input, button) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return showToast("手机暂不支持语音识别");
  const recognition = new Recognition();
  button.textContent = "聆听中…";
  recognition.lang = "zh-CN";
  recognition.onresult = (event) => {
    const text = event.results[event.results.length - 1][0].transcript;
    input.value = input.value ? `${input.value}，${text}` : text;
    input.dispatchEvent(new Event("input"));
  };
  recognition.onerror = (event) => showToast(event?.error === "service-unavailable" ? "请先在手机设置中启用语音识别服务，也可以用键盘麦克风输入" : event?.error === "not-allowed" ? "请允许麦克风权限后再试" : event?.error === "busy" ? "语音服务正忙，请稍后再试" : "没有听清楚，请再试一次");
  recognition.onend = () => { button.textContent = "🎙️ 说一说"; };
  recognition.start();
}

document.querySelector("#record-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const meta = getMeta(recordType);
  let value;
  let unit = meta.unit;
  let note = document.querySelector("#record-note").value.trim();
  if (recordType === "meal") {
    const food = document.querySelector("#meal-name").value.trim();
    const amount = Number(document.querySelector("#portion-amount").value);
    const portionUnit = document.querySelector("#portion-unit").value;
    if (!food) return showToast("先写下吃了什么吧");
    value = estimate(food, amount, portionUnit);
    note = `${food} · ${amount}${portionUnit}${note ? ` · ${note}` : ""}`;
  } else if (meta.kind === "text") { value = 1; note = document.querySelector("#text-record-value").value.trim(); if (!note) return showToast("先写下一点内容吧"); }
  else value = Number(document.querySelector("#record-value").value);
  state.entries.unshift({ id: Date.now(), type: recordType, value, unit, note, recordedAt: new Date(document.querySelector("#record-time").value).toISOString() });
  saveState();
  recordDialog.close();
  showToast(recordType === "meal" ? `已记录，估算约 ${value} 千卡 🥗` : "记录成功，时间也一起记下啦 🌼");
  render();
});

document.querySelector("#plan-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const oldPlan = editingPlanIndex >= 0 ? state.plans[editingPlanIndex] : null;
  const plan = { id: oldPlan?.id || `plan-${Date.now()}`, icon: document.querySelector("#plan-icon").value.trim() || "🌱", title: document.querySelector("#plan-title").value.trim(), detail: document.querySelector("#plan-detail").value.trim(), repeat: document.querySelector("#plan-repeat").value, completedDates: oldPlan?.completedDates || [], createdDate: oldPlan?.createdDate || localDayKey() };
  if (!plan.title) return showToast("写下计划名称吧");
  if (editingPlanIndex >= 0) state.plans[editingPlanIndex] = plan;
  else state.plans.push(plan);
  saveState();
  document.querySelector("#plan-dialog").close();
  showToast(editingPlanIndex >= 0 ? "计划调整好啦 📝" : "新计划加好啦 🌱");
  renderPlans();
});
document.querySelector("#delete-plan").onclick = () => {
  if (editingPlanIndex < 0 || !confirm("确定删除这项计划吗？")) return;
  state.plans.splice(editingPlanIndex, 1);
  saveState();
  document.querySelector("#plan-dialog").close();
  showToast("计划已删除");
  renderPlans();
};

document.querySelector("#entry-type").addEventListener("change", (event) => { const entry = state.entries.find((item) => item.id === editingEntryId); renderEntryValueField(event.target.value, entry?.value || 0); });
document.querySelector("#entry-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const entry = state.entries.find((item) => item.id === editingEntryId);
  if (!entry) return;
  entry.type = document.querySelector("#entry-type").value;
  entry.value = getMeta(entry.type).kind === "text" ? 1 : Number(document.querySelector("#entry-value").value);
  entry.unit = getMeta(entry.type).unit;
  entry.recordedAt = new Date(document.querySelector("#entry-time").value).toISOString();
  entry.note = document.querySelector("#entry-note").value.trim();
  saveState(); document.querySelector("#entry-dialog").close(); showToast("记录修改好啦 ✨"); renderHistory();
});

function updateHabitForm(resetUnit = true) {
  const kind = document.querySelector("#habit-kind").value;
  const defaults = { boolean: "完成", count: "次", duration: "分钟", rating: "分", text: "文字", number: "次" };
  if (resetUnit) document.querySelector("#habit-unit").value = defaults[kind];
  document.querySelector("#habit-unit-wrap").hidden = ["boolean", "text"].includes(kind);
  document.querySelector("#habit-rating-wrap").hidden = kind !== "rating";
  document.querySelector("#habit-direction-wrap").hidden = kind === "text";
  if (kind === "text") document.querySelector("#habit-direction").value = "neutral";
  if (kind === "boolean") { document.querySelector("#habit-direction").value = "more"; document.querySelector("#habit-goal").value = "1"; }
  document.querySelector("#habit-goal-unit").textContent = document.querySelector("#habit-unit").value || defaults[kind];
  document.querySelector("#habit-goal-wrap").hidden = kind === "text" || document.querySelector("#habit-direction").value === "neutral";
}
document.querySelector("#habit-kind").addEventListener("change", updateHabitForm);
document.querySelector("#habit-direction").addEventListener("change", () => updateHabitForm(false));
document.querySelector("#habit-unit").addEventListener("input", (event) => { document.querySelector("#habit-goal-unit").textContent = event.target.value; });
document.querySelector("#habit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.querySelector("#habit-name").value.trim();
  const unit = document.querySelector("#habit-unit").value.trim();
  const icon = document.querySelector("#habit-icon").value.trim() || "🌿";
  const kind = document.querySelector("#habit-kind").value;
  const direction = document.querySelector("#habit-direction").value;
  const goal = direction === "neutral" ? undefined : Number(document.querySelector("#habit-goal").value);
  const ratingMax = kind === "rating" ? Number(document.querySelector("#habit-rating-max").value) : undefined;
  if (!name || !unit) return showToast("习惯名称和单位都要填写哦");
  const builtin = name === "吸烟" ? "smoking" : name === "饮酒" ? "alcohol" : null;
  if (builtin) {
    state.removedBuiltins = state.removedBuiltins.filter((type) => type !== builtin);
    if (!state.visible.includes(builtin)) state.visible.push(builtin);
  } else {
    const id = `custom-${Date.now()}`;
    state.customHabits.push({ id, name, unit, icon, kind, direction, goal, ratingMax });
    state.typeOrder.push(id);
  }
  saveState();
  document.querySelector("#habit-dialog").close();
  document.querySelector("#habit-form").reset();
  document.querySelector("#habit-icon").value = "🌿";
  document.querySelector("#habit-kind").value = "count";
  updateHabitForm();
  showToast(`${name} 已加入今天 🌿`);
  renderProfile();
});

document.querySelector("#day-note-form").addEventListener("submit", (event) => {
  event.preventDefault(); if (!editingDayNoteKey) return;
  const note = document.querySelector("#day-note-text").value.trim();
  if (note) state.dayNotes[editingDayNoteKey] = note; else delete state.dayNotes[editingDayNoteKey];
  saveState(); document.querySelector("#day-note-dialog").close(); showToast(note ? "日期备注保存好啦 🏷️" : "日期备注已清除"); if (trendDetailType) renderTrendDetail(trendDetailType);
});
document.querySelector("#clear-day-note").onclick = () => { document.querySelector("#day-note-text").value = ""; document.querySelector("#day-note-form").requestSubmit(); };

document.querySelector("#goal-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const value = Number(document.querySelector("#goal-value").value);
  if (!editingGoalType || !Number.isFinite(value) || value <= 0) return showToast("请输入大于 0 的目标");
  state.goals[editingGoalType] = value;
  saveState();
  document.querySelector("#goal-dialog").close();
  showToast("目标保存好啦 🎯");
  renderProfile();
});

document.querySelector("#analyze-text").onclick = analyzeSmartText;
document.querySelector("#confirm-smart").onclick = () => {
  if (!smartResults.length) return;
  const stamp = Date.now();
  state.entries.unshift(...smartResults.map((entry, index) => ({ ...entry, id: stamp + index })));
  saveState();
  document.querySelector("#smart-dialog").close();
  showToast(`已经帮你添加 ${smartResults.length} 项记录 ✨`);
  view = "today";
  render();
};
document.querySelector("#take-photo").onclick = () => window.AndroidMedia ? window.AndroidMedia.takePhoto() : showToast("当前设备无法打开相机");
document.querySelector("#choose-photo").onclick = () => window.AndroidMedia ? window.AndroidMedia.choosePhoto() : showToast("当前设备无法打开相册");
document.querySelector("#backup-file").addEventListener("change", (event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => restoreBackupText(String(reader.result)); reader.readAsText(file); event.target.value = ""; });
document.querySelectorAll("[data-close]").forEach((button) => button.onclick = () => document.querySelector(`#${button.dataset.close}`).close());
document.querySelectorAll("[data-nav]").forEach((button) => button.onclick = () => navigate(button.dataset.nav));
document.querySelector("#open-record").onclick = () => openRecord();
document.querySelector("#open-smart").onclick = openSmartDialog;
document.querySelector("#open-notifications").onclick = openNotifications;
document.querySelector("#close-record").onclick = () => recordDialog.close();
bindVoiceButtons();
saveState();
render();
