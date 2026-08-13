"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type HealthEntry = { id: number; type: string; value: number; unit: string; note: string; recordedAt: string };
type PlanRepeat = "daily" | "weekdays" | "weekends" | "once";
type Plan = { id: string; icon: string; title: string; detail: string; repeat: PlanRepeat; completedDates: string[]; createdDate: string; done?: boolean };
type HabitKind = "number" | "boolean" | "count" | "duration" | "rating" | "text";
type GoalDirection = "more" | "less" | "neutral";
type Habit = { id: string; icon: string; name: string; unit: string; visible: boolean; builtIn?: boolean; kind: HabitKind; direction: GoalDirection; goal?: number; ratingMax?: number };
type TypeMeta = { name: string; icon: string; unit: string; value: number; className: string; kind: HabitKind; direction: GoalDirection; goal?: number; ratingMax?: number };
type Goals = { sleep: number; exercise: number; water: number };
type AppData = {
  version: number;
  entries: HealthEntry[];
  plans: Plan[];
  habits: Habit[];
  profile: { nickname: string; avatar: string };
  goals: Goals;
  notificationsSeen: boolean;
  notificationDate: string;
  lastBackupAt: string;
  typeOrder: string[];
  dayNotes: Record<string, string>;
};

type SpeechRecognitionResultLike = { 0: { transcript: string } };
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const STORAGE_KEY = "healthy-pig-local-v5";
const LEGACY_STORAGE_KEYS = ["healthy-pig-local-v4", "healthy-pig-local-v3"];
const CORE_TYPES = ["sleep", "meal", "exercise", "water"];
const TYPE_META: Record<string, TypeMeta> = {
  sleep: { name: "睡眠", icon: "🌙", unit: "小时", value: 7.5, className: "sleep-card", kind: "duration", direction: "more" },
  meal: { name: "饮食", icon: "🥗", unit: "千卡", value: 0, className: "food-card", kind: "number", direction: "neutral" },
  exercise: { name: "运动", icon: "🏃", unit: "分钟", value: 30, className: "exercise-card", kind: "duration", direction: "more" },
  water: { name: "饮水", icon: "💧", unit: "ml", value: 300, className: "water-card", kind: "number", direction: "more" },
  smoking: { name: "吸烟", icon: "🚭", unit: "根", value: 0, className: "smoking-card", kind: "count", direction: "less", goal: 0 },
  alcohol: { name: "饮酒", icon: "🍷", unit: "杯", value: 0, className: "alcohol-card", kind: "count", direction: "less", goal: 0 },
};
const NAV_ITEMS = [
  { icon: "☀️", label: "今天" },
  { icon: "🌈", label: "趋势" },
  { icon: "📝", label: "计划" },
  { icon: "🐣", label: "我的" },
];
const DEFAULT_PLANS: Plan[] = [
  { id: "sleep-plan", icon: "🌙", title: "23:00 前放下手机", detail: "给大脑一点放松时间", repeat: "daily", completedDates: [], createdDate: "" },
  { id: "food-plan", icon: "🥗", title: "吃满 3 份蔬果", detail: "给身体补充缤纷营养", repeat: "daily", completedDates: [], createdDate: "" },
  { id: "exercise-plan", icon: "🏃", title: "活动 50 分钟", detail: "散步也算认真运动", repeat: "daily", completedDates: [], createdDate: "" },
];
const DEFAULT_DATA: AppData = {
  version: 5,
  entries: [],
  plans: DEFAULT_PLANS,
  habits: [
    { id: "smoking", icon: "🚭", name: "吸烟", unit: "根", visible: false, builtIn: true, kind: "count", direction: "less", goal: 0 },
    { id: "alcohol", icon: "🍷", name: "饮酒", unit: "杯", visible: false, builtIn: true, kind: "count", direction: "less", goal: 0 },
  ],
  profile: { nickname: "宝宝", avatar: "😊" },
  goals: { sleep: 7.5, exercise: 50, water: 1800 },
  notificationsSeen: false,
  notificationDate: "",
  lastBackupAt: "",
  typeOrder: ["sleep", "meal", "exercise", "water", "smoking", "alcohol"],
  dayNotes: {},
};

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function localDayKey(date = new Date()) { return localDateTimeValue(date).slice(0, 10); }
function todayKey() { return localDayKey(); }
function isToday(value: string) { return localDayKey(new Date(value)) === todayKey(); }
function localDateTimeValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function formatTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function repeatLabel(repeat: PlanRepeat) { return ({ daily: "每天", weekdays: "工作日", weekends: "周末", once: "仅一次" } as const)[repeat]; }
function kindLabel(kind: HabitKind) { return ({ number: "数值", boolean: "完成状态", count: "次数", duration: "时长", rating: "评分", text: "文字" } as const)[kind]; }
function directionLabel(direction: GoalDirection) { return direction === "more" ? "越多越接近目标" : direction === "less" ? "越少越好" : "只观察变化"; }
function planAppliesOn(plan: Plan, date = new Date()) {
  if (plan.repeat === "weekdays") return date.getDay() >= 1 && date.getDay() <= 5;
  if (plan.repeat === "weekends") return date.getDay() === 0 || date.getDay() === 6;
  if (plan.repeat === "once") return !plan.completedDates.length || plan.completedDates.includes(localDayKey(date));
  return true;
}
function planDoneOn(plan: Plan, date = new Date()) { return plan.completedDates.includes(localDayKey(date)); }
function normalizeHabit(habit: Partial<Habit> & Pick<Habit, "id" | "name" | "icon" | "unit">): Habit {
  const inferredKind: HabitKind = habit.id === "smoking" || habit.id === "alcohol" ? "count" : "number";
  return { ...habit, visible: Boolean(habit.visible), builtIn: Boolean(habit.builtIn), kind: habit.kind ?? inferredKind, direction: habit.direction ?? (habit.id === "smoking" || habit.id === "alcohol" ? "less" : "neutral"), goal: Number.isFinite(Number(habit.goal)) ? Number(habit.goal) : undefined, ratingMax: habit.ratingMax ?? 5 };
}
function normalizeData(raw: unknown): AppData {
  const input = raw && typeof raw === "object" ? raw as Partial<AppData> & { plans?: Array<Partial<Plan> & { done?: boolean }>; customHabits?: Array<{ id: string; icon: string; name: string; unit: string }>; visible?: string[]; removedBuiltins?: string[] } : {};
  const next = clone(DEFAULT_DATA);
  next.version = 5;
  next.entries = Array.isArray(input.entries) ? input.entries.filter((entry): entry is HealthEntry => Boolean(entry && typeof entry === "object" && typeof entry.recordedAt === "string" && Number.isFinite(Number(entry.value)))).map((entry) => ({ ...entry, id: Number(entry.id) || Date.now() + Math.random(), value: Number(entry.value), note: String(entry.note ?? ""), unit: String(entry.unit ?? "次"), type: String(entry.type ?? "exercise") })) : [];
  next.habits = (Array.isArray(input.habits) ? input.habits : [
    ...clone(DEFAULT_DATA.habits).filter((habit) => !input.removedBuiltins?.includes(habit.id)).map((habit) => ({ ...habit, visible: Boolean(input.visible?.includes(habit.id)) })),
    ...(Array.isArray(input.customHabits) ? input.customHabits.map((habit) => ({ ...habit, visible: true, builtIn: false })) : []),
  ]).map((habit) => normalizeHabit(habit));
  next.profile = { ...next.profile, ...(input.profile ?? {}) };
  next.goals = { ...next.goals, ...(input.goals ?? {}) };
  next.notificationsSeen = Boolean(input.notificationsSeen);
  next.notificationDate = typeof input.notificationDate === "string" ? input.notificationDate : "";
  next.lastBackupAt = typeof input.lastBackupAt === "string" ? input.lastBackupAt : "";
  const allTypes = [...CORE_TYPES, ...next.habits.map((habit) => habit.id)];
  next.typeOrder = [...new Set([...(Array.isArray(input.typeOrder) ? input.typeOrder : []), ...allTypes])].filter((type) => allTypes.includes(type));
  next.dayNotes = input.dayNotes && typeof input.dayNotes === "object" ? input.dayNotes : {};
  const sourcePlans = Array.isArray(input.plans) && input.plans.length ? input.plans : DEFAULT_PLANS;
  next.plans = sourcePlans.map((plan, index) => ({
    id: String(plan.id ?? `plan-${index}`), icon: String(plan.icon ?? "🌱"), title: String(plan.title ?? "健康计划"), detail: String(plan.detail ?? ""),
    repeat: (["daily", "weekdays", "weekends", "once"].includes(String(plan.repeat)) ? plan.repeat : "daily") as PlanRepeat,
    completedDates: Array.isArray(plan.completedDates) ? plan.completedDates.filter((date): date is string => typeof date === "string") : plan.done ? [todayKey()] : [],
    createdDate: typeof plan.createdDate === "string" && plan.createdDate ? plan.createdDate : todayKey(),
  }));
  return next;
}
function lastDays(count = 7) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (count - 1 - index));
    return date;
  });
}
function entriesOnDay(entries: HealthEntry[], type: string, day: Date) { return entries.filter((entry) => entry.type === type && localDayKey(new Date(entry.recordedAt)) === localDayKey(day)); }
function aggregateEntries(entries: HealthEntry[], meta: TypeMeta) {
  if (!entries.length) return 0;
  if (meta.kind === "rating") return entries.reduce((sum, entry) => sum + entry.value, 0) / entries.length;
  if (meta.kind === "boolean") return Math.max(...entries.map((entry) => entry.value));
  if (meta.kind === "text") return entries.length;
  return entries.reduce((sum, entry) => sum + entry.value, 0);
}
function displayEntry(entry: HealthEntry | null, meta: TypeMeta) {
  if (!entry) return { value: "—", unit: meta.kind === "text" ? "" : meta.unit, detail: "今天还没有记录" };
  if (meta.kind === "boolean") return { value: entry.value ? "已完成" : "未完成", unit: "", detail: entry.note || "已记录状态" };
  if (meta.kind === "rating") return { value: entry.value, unit: `/ ${meta.ratingMax ?? 5} 分`, detail: entry.note || "已记录评分" };
  if (meta.kind === "text") return { value: "已记录", unit: "", detail: entry.note || "已写下当天感受" };
  return { value: entry.value, unit: entry.unit || meta.unit, detail: entry.note || "已记录" };
}
function meetsGoal(value: number, hasEntries: boolean, meta: TypeMeta) {
  if (!hasEntries || meta.goal === undefined || meta.direction === "neutral") return false;
  return meta.direction === "less" ? value <= meta.goal : value >= meta.goal;
}
function streakFor(rows: Array<{ value: number; entries: HealthEntry[] }>, meta: TypeMeta) {
  let streak = 0;
  for (const row of [...rows].reverse()) { if (meetsGoal(row.value, row.entries.length > 0, meta)) streak += 1; else break; }
  return streak;
}
function trendMessage(values: number[], meta: TypeMeta) {
  const present = values.filter((value) => value > 0);
  if (present.length < 2) return "记录多一点后，会更容易看出变化";
  const half = Math.max(1, Math.floor(present.length / 2));
  const earlier = present.slice(0, half).reduce((sum, value) => sum + value, 0) / half;
  const recentValues = present.slice(half); const recent = recentValues.reduce((sum, value) => sum + value, 0) / Math.max(1, recentValues.length);
  const delta = recent - earlier;
  if (Math.abs(delta) < Math.max(0.1, Math.abs(earlier) * 0.05)) return "最近比较平稳，按自己的节奏继续就好";
  const improving = meta.direction === "less" ? delta < 0 : meta.direction === "more" ? delta > 0 : false;
  if (meta.direction === "neutral") return delta > 0 ? "最近记录略有上升，可结合日期备注看看原因" : "最近记录略有下降，可结合日期备注看看原因";
  return improving ? "最近更接近自己的目标了，轻松保持就好" : "最近有些波动，不必有压力，留意身体感受就好";
}
function estimateCalories(food: string, amount: number, portionUnit: string) {
  const table: Array<[string[], number]> = [
    [["米饭", "粥"], 116], [["面", "粉"], 137], [["鸡蛋", "蛋"], 144], [["鸡肉", "鸡胸"], 165],
    [["牛肉"], 250], [["鱼", "虾"], 120], [["牛奶"], 54], [["酸奶"], 72], [["面包"], 265],
    [["饺子", "包子"], 220], [["沙拉", "蔬菜"], 80], [["水果", "苹果", "香蕉", "橙"], 60],
  ];
  const per100g = table.find(([words]) => words.some((word) => food.includes(word)))?.[1] ?? 120;
  const grams = amount * ({ 克: 1, 毫升: 1, 份: 250, 碗: 300, 个: 80 }[portionUnit] ?? 1);
  return Math.max(0, Math.round(per100g * grams / 100));
}
function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function sentenceAt(text: string, index: number) {
  const before = text.slice(0, index); const after = text.slice(index);
  const start = Math.max(before.lastIndexOf("，"), before.lastIndexOf("。"), before.lastIndexOf("；"), before.lastIndexOf("\n")) + 1;
  const endOffsets = [after.indexOf("，"), after.indexOf("。"), after.indexOf("；"), after.indexOf("\n")].filter((value) => value >= 0);
  return text.slice(start, index + (endOffsets.length ? Math.min(...endOffsets) : after.length)).trim();
}
function inferRecordedAt(context: string, type?: string) {
  const date = new Date();
  if (/前天/.test(context)) date.setDate(date.getDate() - 2);
  else if (/昨天|昨日|昨晚|昨早/.test(context)) date.setDate(date.getDate() - 1);
  let hour = date.getHours(); let minute = date.getMinutes();
  const explicit = context.match(/(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})\s*(?:[:：点时])\s*(半|\d{1,2})?/);
  if (explicit) {
    hour = Math.min(23, Number(explicit[2])); minute = explicit[3] === "半" ? 30 : Math.min(59, Number(explicit[3] || 0));
    if (/下午|晚上/.test(explicit[1] || "") && hour < 12) hour += 12;
    if (/凌晨/.test(explicit[1] || "") && hour === 12) hour = 0;
  } else if (/早餐|早饭|早上|昨早/.test(context)) { hour = 8; minute = 0; }
  else if (/上午/.test(context)) { hour = 10; minute = 0; }
  else if (/午餐|午饭|中午/.test(context)) { hour = 12; minute = 30; }
  else if (/下午/.test(context)) { hour = 15; minute = 0; }
  else if (/夜宵/.test(context)) { hour = 22; minute = 30; }
  else if (/晚餐|晚饭/.test(context)) { hour = 19; minute = 0; }
  else if (/晚上|昨晚/.test(context)) { hour = type === "sleep" ? 23 : 20; minute = 0; }
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}
function parseNatural(text: string, habits: Habit[]): HealthEntry[] {
  const results: HealthEntry[] = [];
  const add = (type: string, value: number, unit: string, note: string, context = note) => results.push({ id: Date.now() + results.length, type, value: Math.round(value * 10) / 10, unit, note, recordedAt: inferRecordedAt(context, type) });
  for (const match of text.matchAll(/(?:睡了|睡眠(?:了|是)?)[^\d]{0,5}(\d+(?:\.\d+)?)\s*(?:个?小时|钟头)/g)) add("sleep", Number(match[1]), "小时", match[0], sentenceAt(text, match.index ?? 0));
  for (const match of text.matchAll(/(?:运动|跑步|散步|快走|瑜伽|骑行)[^\d]{0,8}(\d+(?:\.\d+)?)\s*(分钟|分|小时)/g)) add("exercise", Number(match[1]) * (match[2] === "小时" ? 60 : 1), "分钟", match[0], sentenceAt(text, match.index ?? 0));
  for (const match of text.matchAll(/(?:喝水|饮水)[^\d]{0,6}(\d+(?:\.\d+)?)\s*(ml|毫升|升|l)/gi)) add("water", Number(match[1]) * (/升|l/i.test(match[2]) && !/毫升/i.test(match[2]) ? 1000 : 1), "ml", match[0], sentenceAt(text, match.index ?? 0));
  for (const match of text.matchAll(/(?:抽烟|吸烟)[^\d]{0,5}(\d+(?:\.\d+)?)\s*根/g)) add("smoking", Number(match[1]), "根", match[0], sentenceAt(text, match.index ?? 0));
  for (const match of text.matchAll(/(?:喝酒|饮酒|啤酒|红酒|白酒)[^\d]{0,6}(\d+(?:\.\d+)?)\s*(?:杯|瓶|两)/g)) add("alcohol", Number(match[1]), "杯", match[0], sentenceAt(text, match.index ?? 0));
  text.split(/[，。；;\n]/).filter((segment) => /(?:早餐|早饭|午餐|午饭|晚餐|晚饭|夜宵|吃了|吃的)/.test(segment)).forEach((segment) => {
    const portion = segment.match(/(\d+(?:\.\d+)?)\s*(份|碗|个|克|毫升)/);
    const amount = portion ? Number(portion[1]) : 1;
    const unit = portion?.[2] ?? "份";
    add("meal", estimateCalories(segment, amount, unit), "千卡", `${segment.trim()} · 约${amount}${unit}`, segment);
  });
  habits.filter((habit) => !habit.builtIn).forEach((habit) => {
    if (habit.kind === "boolean" && text.includes(habit.name)) {
      const index = text.indexOf(habit.name); const context = sentenceAt(text, index); const undone = new RegExp(`(?:没|没有|未)(?:有)?[^，。；]{0,5}${escapeRegex(habit.name)}`).test(context);
      add(habit.id, undone ? 0 : 1, habit.unit, context, context); return;
    }
    if (habit.kind === "text") {
      const pattern = new RegExp(`${escapeRegex(habit.name)}(?:是|[:：])?([^，。；\\n]+)`);
      const match = text.match(pattern); if (match) add(habit.id, 1, habit.unit, match[1].trim(), sentenceAt(text, match.index ?? 0)); return;
    }
    const pattern = new RegExp(`${escapeRegex(habit.name)}[^\\d]{0,8}(\\d+(?:\\.\\d+)?)\\s*(?:${escapeRegex(habit.unit)})?`, "g");
    for (const match of text.matchAll(pattern)) add(habit.id, Number(match[1]), habit.unit, match[0], sentenceAt(text, match.index ?? 0));
  });
  return results;
}

function VoiceButton({ onText, onUnavailable }: { onText: (text: string) => void; onUnavailable: () => void }) {
  const [listening, setListening] = useState(false);
  function startListening() {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return onUnavailable();
    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.onresult = (event) => onText(event.results[event.results.length - 1][0].transcript);
    recognition.onerror = () => { setListening(false); onUnavailable(); };
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  }
  return <button className={listening ? "voice-button listening" : "voice-button"} type="button" onClick={startListening}>{listening ? "聆听中…" : "🎙️ 说一说"}</button>;
}

export default function Home() {
  const [data, setData] = useState<AppData>(() => clone(DEFAULT_DATA));
  const [hydrated, setHydrated] = useState(false);
  const [activeNav, setActiveNav] = useState(0);
  const [toast, setToast] = useState("");
  const [recordType, setRecordType] = useState("exercise");
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordTime, setRecordTime] = useState(localDateTimeValue());
  const [recordNote, setRecordNote] = useState("");
  const [mealName, setMealName] = useState("");
  const [portionAmount, setPortionAmount] = useState(1);
  const [portionUnit, setPortionUnit] = useState("份");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const [smartText, setSmartText] = useState("");
  const [smartResults, setSmartResults] = useState<HealthEntry[]>([]);
  const [editingPlan, setEditingPlan] = useState<Plan | null | undefined>(undefined);
  const [habitOpen, setHabitOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [goalType, setGoalType] = useState<keyof Goals | null>(null);
  const [trendType, setTrendType] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<HealthEntry | null>(null);
  const [trendDays, setTrendDays] = useState<7 | 30 | 90>(7);
  const [editingDayNote, setEditingDayNote] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let next = normalizeData(DEFAULT_DATA);
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) ?? LEGACY_STORAGE_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean) ?? "null";
      const saved = JSON.parse(stored);
      if (saved) next = normalizeData(saved);
      else {
        const oldProfile = JSON.parse(window.localStorage.getItem("shengxi-profile") ?? "null");
        if (oldProfile) next.profile = { nickname: oldProfile.nickname || "宝宝", avatar: oldProfile.avatar || "😊" };
      }
    } catch { /* invalid browser data falls back safely */ }
    if (next.notificationDate !== todayKey()) { next.notificationDate = todayKey(); next.notificationsSeen = false; }
    window.queueMicrotask(() => { setData(next); setHydrated(true); });
  }, []);

  useEffect(() => { if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }, [data, hydrated]);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2600); return () => window.clearTimeout(timer); }, [toast]);

  const metaFor = (type: string): TypeMeta => {
    if (TYPE_META[type]) return { ...TYPE_META[type], goal: type === "sleep" || type === "exercise" || type === "water" ? data.goals[type] : TYPE_META[type].goal };
    const habit = data.habits.find((item) => item.id === type);
    return { name: habit?.name ?? "自定义", icon: habit?.icon ?? "🌿", unit: habit?.unit ?? "次", value: 0, className: "custom-card", kind: habit?.kind ?? "number", direction: habit?.direction ?? "neutral", goal: habit?.goal, ratingMax: habit?.ratingMax ?? 5 };
  };
  const enabledTypes = useMemo(() => {
    const enabled = [...CORE_TYPES, ...data.habits.filter((habit) => habit.visible).map((habit) => habit.id)];
    return [...enabled].sort((a, b) => data.typeOrder.indexOf(a) - data.typeOrder.indexOf(b));
  }, [data.habits, data.typeOrder]);
  const latest = (type: string) => data.entries.find((entry) => entry.type === type && isToday(entry.recordedAt)) ?? null;
  const estimatedCalories = estimateCalories(mealName, portionAmount, portionUnit);

  function updateData(update: (current: AppData) => AppData) { setData((current) => update(clone(current))); }
  function changePage(index: number) { setActiveNav(index); setTrendType(null); setHistoryOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function openRecord(type = "exercise") { setRecordType(type); setRecordTime(localDateTimeValue()); setRecordNote(""); setMealName(""); setPortionAmount(1); setPortionUnit("份"); setRecordOpen(true); }
  function saveRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const meta = metaFor(recordType);
    const value = recordType === "meal" ? estimatedCalories : meta.kind === "text" ? 1 : Number(form.get("value"));
    const note = recordType === "meal" ? `${mealName.trim()} · ${portionAmount}${portionUnit}${recordNote ? ` · ${recordNote}` : ""}` : recordNote.trim();
    const entry = { id: Date.now(), type: recordType, value, unit: meta.unit, note, recordedAt: new Date(recordTime).toISOString() };
    updateData((current) => ({ ...current, entries: [entry, ...current.entries] }));
    setRecordOpen(false);
    setToast(recordType === "meal" ? `已记录，估算约 ${value} 千卡 🥗` : "记录成功，时间也一起记下啦 🌼");
  }
  function readPhoto(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") { updateData((current) => ({ ...current, profile: { ...current.profile, avatar: reader.result as string } })); setAvatarOpen(false); setToast("头像换好啦 📷"); } };
    reader.readAsDataURL(file);
  }
  function avatarMarkup(value: string) { return value.startsWith("data:image/") ? <img src={value} alt="个人头像" /> : <span>{value}</span>; }
  function commitTypeOrder(visibleOrder: string[]) {
    updateData((current) => { let visibleIndex = 0; const visibleSet = new Set(visibleOrder); const order = current.typeOrder.map((type) => visibleSet.has(type) ? visibleOrder[visibleIndex++] : type); return { ...current, typeOrder: order }; });
  }
  function exportBackup() {
    const exportedAt = new Date().toISOString();
    const backup = { format: "healthy-pig-backup", version: 5, exportedAt, data: { ...data, lastBackupAt: exportedAt } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `健康小猪备份-${todayKey()}.json`; link.style.display = "none"; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    updateData((current) => ({ ...current, lastBackupAt: exportedAt })); setToast("备份文件已保存到本机 🔒");
  }
  function importBackup(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed?.format !== "healthy-pig-backup" || !parsed.data) throw new Error("invalid");
        if (!window.confirm("恢复备份会用备份内容替换当前设备的数据，确定继续吗？")) return;
        const restored = normalizeData(parsed.data); restored.lastBackupAt = new Date().toISOString(); setData(restored); setToast("备份已恢复，记录都回来啦 🌼"); changePage(0);
      } catch { setToast("没有识别到有效的健康小猪备份文件"); }
    };
    reader.readAsText(file);
  }

  const notifications = useMemo(() => {
    const items: Array<{ icon: string; title: string; detail: string; type?: string; page?: number }> = [];
    const hasToday = (type: string) => data.entries.some((entry) => entry.type === type && isToday(entry.recordedAt));
    if (!hasToday("water")) items.push({ icon: "💧", title: "今天还没记录喝水", detail: "喝一小杯，也算认真照顾自己。", type: "water" });
    if (!hasToday("exercise")) items.push({ icon: "🌱", title: "起来伸伸懒腰吧", detail: "散步十分钟也很好。", type: "exercise" });
    const undone = data.plans.filter((plan) => planAppliesOn(plan) && !planDoneOn(plan)).length;
    if (undone) items.push({ icon: "📝", title: `还有 ${undone} 项计划可以完成`, detail: "不着急，按自己的节奏来。", page: 2 });
    if (!items.length) items.push({ icon: "🌼", title: "今天完成得很棒", detail: "所有提醒都照顾到了。" });
    return items;
  }, [data.entries, data.plans]);

  const titles = [
    { eyebrow: new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date()), title: `把${data.profile.nickname}养成健健康康的小猪` },
    { eyebrow: `近 ${trendDays === 90 ? "3 个月" : `${trendDays} 天`}健康趋势`, title: trendType ? `${metaFor(trendType).name}的每日变化` : "一起看看最近的小变化" },
    { eyebrow: `${data.plans.length} 项健康计划`, title: "自己的目标，自己来安排" },
    { eyebrow: "个人资料与习惯", title: `${data.profile.nickname}的健康小空间` },
  ];

  return <main className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => changePage(0)}><span className="brand-mark">🐷</span><span>健康小猪</span></button>
      <nav aria-label="主导航">{NAV_ITEMS.map((item, index) => <button key={item.label} className={activeNav === index ? "nav-item active" : "nav-item"} onClick={() => changePage(index)}><span>{item.icon}</span>{item.label}</button>)}</nav>
      <div className="sidebar-card"><span className="mini-label">本周小结</span><strong>{data.entries.filter((entry) => lastDays().some((day) => day.toDateString() === new Date(entry.recordedAt).toDateString())).length} <small>次</small></strong><p>每一次记录都很珍贵 ✨</p></div>
      <button className="profile" onClick={() => changePage(3)}><span className="avatar">{avatarMarkup(data.profile.avatar)}</span><span><strong>{data.profile.nickname}</strong><small>本机私密保存</small></span></button>
    </aside>

    <section className="content">
      <header className="topbar"><div><p className="eyebrow">{titles[activeNav].eyebrow}</p><h1>{titles[activeNav].title}</h1></div><div className="top-actions">
        <button className="smart-top-button" aria-label="智能输入" onClick={() => { setSmartText(""); setSmartResults([]); setSmartOpen(true); }}><span>✨</span><b>智能输入</b></button>
        <button className="icon-button" aria-label="查看提醒" onClick={() => { updateData((current) => ({ ...current, notificationsSeen: true })); setNotificationsOpen(true); }}>🔔{!data.notificationsSeen && <span className="notification-dot" />}</button>
        <button className="primary-button" onClick={() => openRecord()}><span>+</span> 记一笔</button>
      </div></header>

      {activeNav === 0 && <TodayView data={data} enabledTypes={enabledTypes} metaFor={metaFor} latest={latest} />}
      {activeNav === 1 && (historyOpen ? <HistoryView data={data} metaFor={metaFor} back={() => setHistoryOpen(false)} edit={setEditingEntry} remove={(entry) => { if (!window.confirm(`删除这条${metaFor(entry.type).name}记录吗？`)) return; updateData((current) => ({ ...current, entries: current.entries.filter((item) => item.id !== entry.id) })); setToast("记录已删除"); }} /> : trendType ? <TrendDetail type={trendType} data={data} meta={metaFor(trendType)} daysCount={trendDays} setDays={setTrendDays} dayNotes={data.dayNotes} editDayNote={setEditingDayNote} back={() => setTrendType(null)} /> : <TrendsView data={data} types={enabledTypes} metaFor={metaFor} daysCount={trendDays} setDays={setTrendDays} openTrend={setTrendType} openHistory={() => setHistoryOpen(true)} />)}
      {activeNav === 2 && <PlansView plans={data.plans} toggle={(id) => updateData((current) => ({ ...current, plans: current.plans.map((plan) => { if (plan.id !== id || !planAppliesOn(plan)) return plan; const key = todayKey(); return { ...plan, completedDates: plan.completedDates.includes(key) ? plan.completedDates.filter((date) => date !== key) : [...plan.completedDates, key] }; }) }))} edit={(plan) => setEditingPlan(plan)} add={() => setEditingPlan(null)} />}
      {activeNav === 3 && <ProfileView data={data} enabledTypes={enabledTypes} metaFor={metaFor} avatarMarkup={avatarMarkup} changeName={(nickname) => updateData((current) => ({ ...current, profile: { ...current.profile, nickname: nickname.trim() || "宝宝" } }))} openAvatar={() => setAvatarOpen(true)} toggleHabit={(id) => updateData((current) => ({ ...current, habits: current.habits.map((habit) => habit.id === id ? { ...habit, visible: !habit.visible } : habit) }))} removeHabit={(id) => updateData((current) => ({ ...current, habits: current.habits.filter((habit) => habit.id !== id), typeOrder: current.typeOrder.filter((type) => type !== id) }))} addHabit={() => setHabitOpen(true)} commitTypeOrder={commitTypeOrder} editGoal={setGoalType} exportBackup={exportBackup} importBackup={() => backupInputRef.current?.click()} />}
    </section>

    <nav className="mobile-nav" aria-label="移动导航">{NAV_ITEMS.map((item, index) => <button key={item.label} className={activeNav === index ? "active" : ""} onClick={() => changePage(index)}><span>{item.icon}</span>{item.label}</button>)}</nav>

    {recordOpen && <Modal close={() => setRecordOpen(false)} title="记下这一刻" kicker="快速记录">
      <div className="type-tabs">{enabledTypes.map((type) => <button type="button" key={type} className={recordType === type ? "active" : ""} onClick={() => setRecordType(type)}>{metaFor(type).name}</button>)}</div>
      <form className="dialog-form" onSubmit={saveRecord}>
        {recordType === "meal" ? <div className="meal-fields"><label><span>吃了什么</span><div className="input-with-voice"><input value={mealName} onChange={(event) => setMealName(event.target.value)} placeholder="例如：鸡胸肉沙拉" required /><VoiceButton onText={setMealName} onUnavailable={() => setToast("当前浏览器不支持语音转文字")} /></div></label><label><span>大概分量</span><div className="portion-row"><input type="number" min="0.1" step="0.1" value={portionAmount} onChange={(event) => setPortionAmount(Number(event.target.value))} /><select value={portionUnit} onChange={(event) => setPortionUnit(event.target.value)}>{["份", "碗", "个", "克", "毫升"].map((unit) => <option key={unit}>{unit}</option>)}</select></div></label><div className="calorie-estimate"><span>✨ 自动估算</span><strong>约 {estimatedCalories} 千卡</strong><small>根据餐食和分量粗略估算，仅供日常参考</small></div></div> : metaFor(recordType).kind === "boolean" ? <label><span>完成状态</span><select name="value" defaultValue="1"><option value="1">已完成</option><option value="0">未完成</option></select></label> : metaFor(recordType).kind === "rating" ? <label><span>{metaFor(recordType).name}评分</span><div className="value-input"><input name="value" type="number" min="1" max={metaFor(recordType).ratingMax ?? 5} step="1" defaultValue={3} required /><em>/ {metaFor(recordType).ratingMax ?? 5} 分</em></div></label> : metaFor(recordType).kind === "text" ? <label><span>写下{metaFor(recordType).name}</span><div className="input-with-voice"><textarea value={recordNote} onChange={(event) => setRecordNote(event.target.value)} placeholder="记录今天的身体感受或备注" required /><VoiceButton onText={(text) => setRecordNote((value) => value ? `${value}，${text}` : text)} onUnavailable={() => setToast("当前浏览器不支持语音转文字")} /></div></label> : <label><span>{metaFor(recordType).name}{metaFor(recordType).kind === "duration" ? "时长" : "数量"}</span><div className="value-input"><input name="value" type="number" min="0" step={recordType === "sleep" ? ".1" : "1"} defaultValue={metaFor(recordType).value} required /><em>{metaFor(recordType).unit}</em></div></label>}
        <label><span>🕐 记录时间</span><input type="datetime-local" value={recordTime} onChange={(event) => setRecordTime(event.target.value)} required /></label>
        {metaFor(recordType).kind !== "text" && <label><span>备注 <small>可选，可直接说</small></span><div className="input-with-voice"><input value={recordNote} onChange={(event) => setRecordNote(event.target.value)} placeholder="写下一点感受" /><VoiceButton onText={(text) => setRecordNote((value) => value ? `${value}，${text}` : text)} onUnavailable={() => setToast("当前浏览器不支持语音转文字")} /></div></label>}
        <button className="save-button" type="submit">保存记录</button>
      </form>
    </Modal>}

    {notificationsOpen && <Modal close={() => setNotificationsOpen(false)} title="今天的小消息" kicker="温柔提醒"><div className="notification-list">{notifications.map((item) => <button key={item.title} className="notification-item" onClick={() => { setNotificationsOpen(false); if (item.type) openRecord(item.type); if (item.page !== undefined) changePage(item.page); }}><span>{item.icon}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div><i>{item.type || item.page !== undefined ? "→" : "✓"}</i></button>)}</div></Modal>}

    {smartOpen && <Modal close={() => setSmartOpen(false)} title="今天都做了什么？" kicker="一句话智能记录"><p className="dialog-tip">例如：“昨晚睡了 7 小时，午饭吃了一碗牛肉面，下午 3 点散步 30 分钟。”识别后可先修改项目、数值和时间。</p><label className="smart-field"><span>语音说或直接输入</span><textarea rows={5} value={smartText} onChange={(event) => setSmartText(event.target.value)} placeholder="把今天的情况一次说完吧" /><VoiceButton onText={(text) => setSmartText((value) => value ? `${value}，${text}` : text)} onUnavailable={() => setToast("当前浏览器不支持语音转文字")} /></label><button className="secondary-button" type="button" onClick={() => setSmartResults(parseNatural(smartText, data.habits))}>帮我识别</button>{smartResults.length > 0 ? <div className="smart-edit-list">{smartResults.map((entry) => <article key={entry.id}><div className="smart-edit-heading"><span>{metaFor(entry.type).icon}</span><strong>检查这条记录</strong><button type="button" onClick={() => setSmartResults((items) => items.filter((item) => item.id !== entry.id))}>删除</button></div><div className="smart-edit-grid"><label><span>项目</span><select value={entry.type} onChange={(event) => { const type = event.target.value; setSmartResults((items) => items.map((item) => item.id === entry.id ? { ...item, type, unit: metaFor(type).unit } : item)); }}>{enabledTypes.map((type) => <option key={type} value={type}>{metaFor(type).name}</option>)}</select></label><label><span>数值</span><div className="value-input"><input type="number" min="0" step="0.1" value={entry.value} onChange={(event) => setSmartResults((items) => items.map((item) => item.id === entry.id ? { ...item, value: Number(event.target.value) } : item))} /><em>{entry.unit}</em></div></label><label className="smart-time-field"><span>记录时间</span><input type="datetime-local" value={localDateTimeValue(new Date(entry.recordedAt))} onChange={(event) => setSmartResults((items) => items.map((item) => item.id === entry.id ? { ...item, recordedAt: new Date(event.target.value).toISOString() } : item))} /></label><label className="smart-note-field"><span>备注</span><input value={entry.note} onChange={(event) => setSmartResults((items) => items.map((item) => item.id === entry.id ? { ...item, note: event.target.value } : item))} /></label></div></article>)}</div> : <div className="smart-empty">输入后点击“帮我识别”，系统会自动拆分到不同记录项目。</div>}<button className="save-button" type="button" disabled={!smartResults.length} onClick={() => { updateData((current) => ({ ...current, entries: [...smartResults, ...current.entries] })); setSmartOpen(false); setToast(`已添加 ${smartResults.length} 项记录 ✨`); changePage(0); }}>确认添加</button></Modal>}

    {editingPlan !== undefined && <PlanDialog plan={editingPlan} close={() => setEditingPlan(undefined)} save={(plan) => { updateData((current) => ({ ...current, plans: editingPlan ? current.plans.map((item) => item.id === plan.id ? plan : item) : [...current.plans, plan] })); setEditingPlan(undefined); setToast(editingPlan ? "计划调整好啦 📝" : "新计划加好啦 🌱"); }} remove={() => { if (!editingPlan) return; updateData((current) => ({ ...current, plans: current.plans.filter((item) => item.id !== editingPlan.id) })); setEditingPlan(undefined); setToast("计划已删除"); }} />}

    {habitOpen && <HabitDialog close={() => setHabitOpen(false)} add={(habit) => { updateData((current) => ({ ...current, habits: [...current.habits.filter((item) => item.id !== habit.id), habit], typeOrder: current.typeOrder.includes(habit.id) ? current.typeOrder : [...current.typeOrder, habit.id] })); setHabitOpen(false); setToast(`${habit.name} 已加入我的习惯 🌿`); }} />}

    {avatarOpen && <Modal close={() => setAvatarOpen(false)} title="选一个喜欢的样子" kicker="更换头像"><div className="avatar-picker">{["😊", "🐷", "🐰", "🐣", "🐻", "🌸"].map((option) => <button key={option} className={data.profile.avatar === option ? "active" : ""} onClick={() => { updateData((current) => ({ ...current, profile: { ...current.profile, avatar: option } })); setAvatarOpen(false); }}>{option}</button>)}</div><div className="avatar-photo-actions"><button onClick={() => cameraInputRef.current?.click()}>📷 拍照</button><button onClick={() => photoInputRef.current?.click()}>🖼️ 选择照片</button></div><input ref={cameraInputRef} hidden type="file" accept="image/*" capture="user" onChange={(event) => readPhoto(event.target.files?.[0])} /><input ref={photoInputRef} hidden type="file" accept="image/*" onChange={(event) => readPhoto(event.target.files?.[0])} /></Modal>}

    {goalType && <GoalDialog type={goalType} value={data.goals[goalType]} close={() => setGoalType(null)} save={(value) => { updateData((current) => ({ ...current, goals: { ...current.goals, [goalType]: value } })); setGoalType(null); setToast("健康目标保存好啦 🎯"); }} />}
    {editingEntry && <EntryDialog entry={editingEntry} types={[...new Set([...enabledTypes, editingEntry.type])]} metaFor={metaFor} close={() => setEditingEntry(null)} save={(entry) => { updateData((current) => ({ ...current, entries: current.entries.map((item) => item.id === entry.id ? entry : item) })); setEditingEntry(null); setToast("记录修改好啦 ✨"); }} />}
    {editingDayNote && <DayNoteDialog dateKey={editingDayNote} value={data.dayNotes[editingDayNote] ?? ""} close={() => setEditingDayNote(null)} save={(note) => { updateData((current) => { const dayNotes = { ...current.dayNotes }; if (note.trim()) dayNotes[editingDayNote] = note.trim(); else delete dayNotes[editingDayNote]; return { ...current, dayNotes }; }); setEditingDayNote(null); setToast(note.trim() ? "日期备注保存好啦 🏷️" : "日期备注已清除"); }} />}
    <input ref={backupInputRef} hidden type="file" accept="application/json,.json" onChange={(event) => { importBackup(event.target.files?.[0]); event.currentTarget.value = ""; }} />
    {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
  </main>;
}

function Modal({ close, title, kicker, children }: { close: () => void; title: string; kicker: string; children: React.ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}><section className="record-modal app-dialog" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><span className="section-kicker">{kicker}</span><h2>{title}</h2></div><button onClick={close} aria-label="关闭">×</button></div>{children}</section></div>;
}

function TodayView({ data, enabledTypes, metaFor, latest }: { data: AppData; enabledTypes: string[]; metaFor: (type: string) => TypeMeta; latest: (type: string) => HealthEntry | null }) {
  const todayEntries = data.entries.filter((entry) => isToday(entry.recordedAt));
  const score = Math.min(96, 70 + todayEntries.length * 4);
  return <>
    <div className="mobile-date">{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date())}</div>
    <section className="hero-grid"><article className="score-card"><div className="score-copy"><span className="section-kicker">今日状态</span><div className="score-line"><strong>{score}</strong><span>/ 100</span></div><p>{todayEntries.length ? "今天也在好好照顾自己 🌟" : "从一条小记录开始吧 🌼"}</p><small>睡眠、餐食、运动、饮水和自己的生活习惯，都可以轻松记下来。</small><div className="score-badges"><span>🔒 本机保存</span><span>🐷 慢慢养成</span></div></div><div className="score-orbit"><div className="orbit-center"><span className="happy-face">˶ᵔ ᵕ ᵔ˶</span><strong>健康小猪</strong></div></div></article><article className="rhythm-card"><div className="card-heading"><span><span className="section-kicker">本周小结</span><h2>近 7 天的你</h2></span></div><div className="rhythm-bars">{lastDays().map((day, index) => { const count = data.entries.filter((entry) => new Date(entry.recordedAt).toDateString() === day.toDateString()).length; return <div key={day.toISOString()} className="bar-column"><span className={index === 6 ? "bar current" : "bar"} style={{ height: `${Math.max(12, count * 20)}%` }} /><small>{index === 6 ? "今" : ["日", "一", "二", "三", "四", "五", "六"][day.getDay()]}</small></div>; })}</div></article></section>
    <div className="section-title"><div><span className="section-kicker">今日记录</span><h2>今天照顾了这些 🌼</h2></div></div>
    <section className="metric-grid">{enabledTypes.map((type) => <MetricCard key={type} type={type} meta={metaFor(type)} entry={latest(type)} />)}</section>
  </>;
}
function MetricCard({ type, meta, entry }: { type: string; meta: TypeMeta; entry: HealthEntry | null }) {
  const display = displayEntry(entry, meta);
  return <article className={`metric-card ${meta.className}`}><div className="metric-top"><span className="metric-icon">{meta.icon}</span></div><span className="section-kicker">{meta.name}{type === "meal" ? " · 自动估算" : ""}</span><div className={`metric-value ${meta.kind === "text" || meta.kind === "boolean" ? "words" : ""}`}><strong>{display.value}</strong><span> {display.unit}</span></div><div className="metric-meta"><span>{display.detail}</span>{entry && <time>{formatTime(entry.recordedAt)}</time>}</div></article>;
}

function RangeSwitch({ value, setValue }: { value: 7 | 30 | 90; setValue: (value: 7 | 30 | 90) => void }) {
  return <div className="range-switch" aria-label="趋势时间范围">{([7, 30, 90] as const).map((days) => <button key={days} className={value === days ? "active" : ""} onClick={() => setValue(days)}>{days === 90 ? "3 个月" : `${days} 天`}</button>)}</div>;
}
type ChartRow = { day: Date; entries: HealthEntry[]; value: number };
type CurvePoint = { x: number; y: number };
function smoothCurve(points: CurvePoint[]) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.slice(1).reduce((path, point, index) => { const previous = points[index]; const middle = (previous.x + point.x) / 2; return `${path} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`; }, `M ${points[0].x} ${points[0].y}`);
}
function bucketChartRows(rows: ChartRow[], daysCount: 7 | 30 | 90, dayNotes: Record<string, string>) {
  const size = daysCount === 90 ? 3 : 1;
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => {
    const group = rows.slice(index * size, index * size + size);
    const recorded = group.filter((row) => row.entries.length > 0);
    return { day: group[group.length - 1].day, value: recorded.length ? recorded.reduce((sum, row) => sum + row.value, 0) / recorded.length : null, note: group.map((row) => dayNotes[localDayKey(row.day)]).find(Boolean) ?? "" };
  });
}
function goalExplanation(meta: TypeMeta) {
  if (meta.direction === "less") return meta.goal === undefined ? "↓ 曲线向下代表数值减少" : `↓ 曲线向下代表改善 · 每天不超过 ${meta.goal} ${meta.unit}`;
  if (meta.direction === "more") return meta.goal === undefined ? "↑ 曲线向上代表更接近目标" : `↑ 越接近 ${meta.goal} ${meta.unit} 越好`;
  return "观察变化，不判断好坏";
}
function CurveChart({ rows, meta, daysCount, dayNotes }: { rows: ChartRow[]; meta: TypeMeta; daysCount: 7 | 30 | 90; dayNotes: Record<string, string> }) {
  const buckets = bucketChartRows(rows, daysCount, dayNotes); const width = 600; const height = 178; const top = 16; const bottom = 24;
  const max = Math.max(1, meta.goal ?? 0, ...buckets.map((bucket) => bucket.value ?? 0));
  const points = buckets.map((bucket, index) => bucket.value === null ? null : ({ x: buckets.length === 1 ? width / 2 : 18 + index / (buckets.length - 1) * (width - 36), y: top + (1 - bucket.value / max) * (height - top - bottom), bucket })).filter(Boolean) as Array<CurvePoint & { bucket: typeof buckets[number] }>;
  const path = smoothCurve(points); const targetY = meta.goal === undefined ? null : top + (1 - Math.min(1, meta.goal / max)) * (height - top - bottom);
  const labelIndexes = [...new Set(Array.from({ length: Math.min(7, buckets.length) }, (_, index) => Math.round(index * (buckets.length - 1) / Math.max(1, Math.min(7, buckets.length) - 1))))];
  return <div className={`curve-chart ${meta.direction}`} role="img" aria-label={`${meta.name}曲线趋势`}><svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">{targetY !== null && <><line className="curve-goal-line" x1="18" x2={width - 18} y1={targetY} y2={targetY} /><text className="curve-goal-label" x={width - 20} y={Math.max(12, targetY - 5)} textAnchor="end">目标 {meta.goal} {meta.unit}</text></>}<path className="curve-path" d={path} vectorEffect="non-scaling-stroke" />{points.map((point, index) => <circle key={index} className={meetsGoal(point.bucket.value ?? 0, point.bucket.value !== null, meta) ? "curve-dot met" : "curve-dot"} cx={point.x} cy={point.y} r={point.bucket.note ? 5 : 3.5}><title>{point.bucket.note || `${Number((point.bucket.value ?? 0).toFixed(1))} ${meta.unit}`}</title></circle>)}</svg><div className="curve-labels">{labelIndexes.map((index) => <span key={index}>{index === buckets.length - 1 ? "今" : `${buckets[index].day.getMonth() + 1}/${buckets[index].day.getDate()}`}</span>)}</div>{daysCount === 90 && <small className="curve-sampling">90 天按每 3 天汇总一个点，共 30 个点</small>}</div>;
}
function MiniCurve({ rows, daysCount }: { rows: ChartRow[]; daysCount: 7 | 30 | 90 }) {
  const buckets = bucketChartRows(rows, daysCount, {}); const max = Math.max(1, ...buckets.map((bucket) => bucket.value ?? 0)); const points = buckets.map((bucket, index) => bucket.value === null ? null : ({ x: buckets.length === 1 ? 60 : index / (buckets.length - 1) * 120, y: 4 + (1 - bucket.value / max) * 30 })).filter(Boolean) as CurvePoint[];
  return <span className="mini-curve" aria-hidden="true"><svg viewBox="0 0 120 38" preserveAspectRatio="none"><path d={smoothCurve(points)} vectorEffect="non-scaling-stroke" /></svg></span>;
}
function TrendsView({ data, types, metaFor, daysCount, setDays, openTrend, openHistory }: { data: AppData; types: string[]; metaFor: (type: string) => TypeMeta; daysCount: 7 | 30 | 90; setDays: (days: 7 | 30 | 90) => void; openTrend: (type: string) => void; openHistory: () => void }) {
  const days = lastDays(daysCount);
  const dayValue = (type: string, day: Date) => aggregateEntries(entriesOnDay(data.entries, type, day), metaFor(type));
  return <section className="subpage"><div className="trend-toolbar"><RangeSwitch value={daysCount} setValue={setDays} /><button className="history-text-button" onClick={openHistory}>历史记录 {data.entries.length}</button></div><article className="subpage-hero trend-hero"><div><span className="section-kicker">轻松回顾</span><h2>每一项变化都能看见 🌟</h2><p>曲线帮助你看方向；目标只是参考，日期备注可以解释感冒、加班或旅行带来的变化。</p></div></article><div className="trend-summary-grid">{["sleep", "exercise", "water"].map((type) => { const meta = metaFor(type); const values = days.map((day) => dayValue(type, day)).filter(Boolean); const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; const display = type === "water" ? Math.round(average) : Number(average.toFixed(1)); return <button className="trend-summary-button" key={type} onClick={() => openTrend(type)}><span className="summary-icon">{meta.icon}</span><small>{type === "sleep" ? "平均睡眠" : type === "exercise" ? "每日活动" : "平均饮水"}</small><strong>{display || "—"} <em>{meta.unit}</em></strong><span>{meta.goal !== undefined ? `目标 ${meta.goal} ${meta.unit} · ` : ""}查看详情</span></button>; })}</div><div className="section-title compact"><div><span className="section-kicker">全部项目</span><h2>我的每一种习惯</h2></div></div><div className="habit-trend-grid">{types.map((type) => { const meta = metaFor(type); const rows = days.map((day) => { const entries = entriesOnDay(data.entries, type, day); return { day, entries, value: aggregateEntries(entries, meta) }; }); return <button key={type} onClick={() => openTrend(type)}><span className="summary-icon">{meta.icon}</span><div><strong>{meta.name}</strong><small>{goalExplanation(meta)} · {trendMessage(rows.map((row) => row.value), meta)}</small></div><MiniCurve rows={rows} daysCount={daysCount} /></button>; })}</div></section>;
}
function TrendDetail({ type, data, meta, daysCount, setDays, dayNotes, editDayNote, back }: { type: string; data: AppData; meta: TypeMeta; daysCount: 7 | 30 | 90; setDays: (days: 7 | 30 | 90) => void; dayNotes: Record<string, string>; editDayNote: (dateKey: string) => void; back: () => void }) {
  const days = lastDays(daysCount);
  const rows = days.map((day) => { const entries = entriesOnDay(data.entries, type, day); return { day, entries, value: aggregateEntries(entries, meta) }; });
  const streak = streakFor(rows, meta);
  const displayValue = (row: typeof rows[number]) => !row.entries.length ? "没有记录" : meta.kind === "boolean" ? (row.value ? "已完成" : "未完成") : meta.kind === "rating" ? `${Number(row.value.toFixed(1))} / ${meta.ratingMax ?? 5} 分` : meta.kind === "text" ? `${row.entries.length} 条文字记录` : `${Number(row.value.toFixed(1))} ${meta.unit}`;
  return <section className="subpage"><div className="detail-topline"><button className="back-button" onClick={back}>‹ 返回全部趋势</button><RangeSwitch value={daysCount} setValue={setDays} /></div><article className="chart-card"><div className="chart-heading"><div><span className="section-kicker">{meta.icon} {meta.name}</span><h2>近 {daysCount === 90 ? "3 个月" : `${daysCount} 天`}变化</h2><p className="trend-gentle-copy">{trendMessage(rows.map((row) => row.value), meta)}</p></div></div>{meta.direction !== "neutral" && <div className={`goal-summary ${meta.direction}`}><strong>{meta.direction === "less" ? "↓ 越低越好" : "↑ 越高越接近目标"}</strong><span>{goalExplanation(meta)}</span>{streak > 0 && <small>最近轻松连续达标 {streak} 天 🌱</small>}</div>}<CurveChart rows={rows} meta={meta} daysCount={daysCount} dayNotes={dayNotes} /></article><div className="daily-detail-list">{rows.slice().reverse().map((row) => { const key = localDayKey(row.day); return <article key={row.day.toISOString()}><time>{new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", weekday: "short" }).format(row.day)}</time><div><strong>{displayValue(row)}</strong><small>{row.entries.map((entry) => entry.note || formatTime(entry.recordedAt)).join(" · ") || "—"}</small>{dayNotes[key] && <p className="day-note-text">🏷️ {dayNotes[key]}</p>}</div><button className="day-note-button" onClick={() => editDayNote(key)}>{dayNotes[key] ? "修改备注" : "＋ 日期备注"}</button></article>; })}</div></section>;
}
function HistoryView({ data, metaFor, back, edit, remove }: { data: AppData; metaFor: (type: string) => TypeMeta; back: () => void; edit: (entry: HealthEntry) => void; remove: (entry: HealthEntry) => void }) {
  const entries = [...data.entries].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  return <section className="subpage history-page"><button className="back-button" onClick={back}>‹ 返回趋势</button><div className="section-title compact"><div><span className="section-kicker">本机记录</span><h2>全部历史记录</h2></div><small>{entries.length} 条</small></div>{entries.length ? <div className="history-list">{entries.map((entry) => { const meta = metaFor(entry.type); const display = displayEntry(entry, meta); return <article key={entry.id}><span className="history-icon">{meta.icon}</span><div><strong>{meta.name} · {display.value} {display.unit}</strong><time>{new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(entry.recordedAt))}</time><small>{entry.note || "没有备注"}</small></div><div className="history-actions"><button onClick={() => edit(entry)}>编辑</button><button className="danger-text" onClick={() => remove(entry)}>删除</button></div></article>; })}</div> : <div className="smart-empty">还没有历史记录，先去“今天”记一笔吧。</div>}</section>;
}
function PlansView({ plans, toggle, edit, add }: { plans: Plan[]; toggle: (id: string) => void; edit: (plan: Plan) => void; add: () => void }) {
  const due = plans.filter((plan) => planAppliesOn(plan)); const done = due.filter((plan) => planDoneOn(plan)).length;
  return <section className="subpage"><article className="subpage-hero plan-hero"><div><span className="section-kicker">今日进度</span><h2>已完成 {done} / {due.length} 项 🌼</h2><p>完成状态按日期保存，每天自动开始新的一天；计划可设置每天、工作日、周末或仅一次。</p></div><div className="plan-progress-ring"><strong>{due.length ? Math.round(done / due.length * 100) : 0}%</strong><span>今日</span></div></article><div className="plan-list">{plans.map((plan) => { const applies = planAppliesOn(plan); const doneToday = planDoneOn(plan); return <article className={`${doneToday ? "plan-row done" : "plan-row"}${applies ? "" : " not-due"}`} key={plan.id}><span className="plan-icon">{plan.icon}</span><div><h3>{plan.title}</h3><p>{plan.detail || "给自己一个小小目标"}</p><small className="repeat-badge">{repeatLabel(plan.repeat)}{applies ? " · 今日计划" : " · 今天不安排"}</small></div><div className="plan-row-actions"><button disabled={!applies} onClick={() => toggle(plan.id)} aria-label="切换今天完成状态">{doneToday ? "✓" : ""}</button><button onClick={() => edit(plan)} aria-label="编辑计划">✎</button></div></article>; })}</div><button className="add-plan-button" onClick={add}><span>＋</span> 增加一项新计划</button></section>;
}
function ProfileView({ data, enabledTypes, metaFor, avatarMarkup, changeName, openAvatar, toggleHabit, removeHabit, addHabit, commitTypeOrder, editGoal, exportBackup, importBackup }: { data: AppData; enabledTypes: string[]; metaFor: (type: string) => TypeMeta; avatarMarkup: (value: string) => React.ReactNode; changeName: (name: string) => void; openAvatar: () => void; toggleHabit: (id: string) => void; removeHabit: (id: string) => void; addHabit: () => void; commitTypeOrder: (types: string[]) => void; editGoal: (type: keyof Goals) => void; exportBackup: () => void; importBackup: () => void }) {
  const dragging = useRef<string | null>(null);
  const startDrag = (type: string, event: React.PointerEvent<HTMLButtonElement>) => { dragging.current = type; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.closest("[data-sort-type]")?.classList.add("dragging"); };
  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>) => { if (!dragging.current) return; const source = event.currentTarget.closest<HTMLElement>("[data-sort-type]"); const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-sort-type]"); if (!source || !target || source === target) return; const rect = target.getBoundingClientRect(); if (event.clientY > rect.top + rect.height / 2) target.after(source); else target.before(source); };
  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>) => { const source = event.currentTarget.closest<HTMLElement>("[data-sort-type]"); const list = source?.parentElement; source?.classList.remove("dragging"); dragging.current = null; if (!list) return; commitTypeOrder(Array.from(list.querySelectorAll<HTMLElement>("[data-sort-type]")).map((item) => item.dataset.sortType ?? "").filter(Boolean)); };
  const moveWithKeyboard = (type: string, delta: -1 | 1) => { const order = [...enabledTypes]; const index = order.indexOf(type); const target = index + delta; if (index < 0 || target < 0 || target >= order.length) return; [order[index], order[target]] = [order[target], order[index]]; commitTypeOrder(order); };
  return <section className="subpage">
    <article className="profile-hero inline-profile"><button className="big-avatar editable-avatar" onClick={openAvatar}>{avatarMarkup(data.profile.avatar)}<i>✎</i></button><div className="inline-name"><span className="section-kicker">点击头像或名字直接修改</span><input defaultValue={data.profile.nickname} maxLength={20} onBlur={(event) => changeName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><p>这里是你的个人健康空间</p></div><span className="level-pill">🐷 健康成长中</span></article>
    <details className="utility-settings habits-settings-web"><summary><span>🧩</span><div><strong>我的习惯</strong><small>{data.habits.length} 个可选习惯 · 点击展开管理</small></div><i>⌄</i></summary><div className="utility-settings-body habits-settings-body"><div className="settings-heading"><div><span className="section-kicker">今天想记录什么</span><p>自定义习惯支持完成状态、次数、时长、评分、文字和普通数值。</p></div></div><div className="core-habit-row">{CORE_TYPES.map((type) => <span key={type}>{TYPE_META[type].icon} {TYPE_META[type].name}<small>基础项目</small></span>)}</div><div className="my-habit-list">{data.habits.map((habit) => <div key={habit.id}><span className="habit-icon">{habit.icon}</span><div><strong>{habit.name}</strong><small>{kindLabel(habit.kind)} · {directionLabel(habit.direction)}{habit.goal !== undefined ? ` · 目标 ${habit.goal}${habit.unit}` : ""}</small></div><button className={habit.visible ? "habit-toggle active" : "habit-toggle"} onClick={() => toggleHabit(habit.id)}>{habit.visible ? "已展示" : "不展示"}</button><button className="habit-remove" onClick={() => removeHabit(habit.id)} aria-label={`删除${habit.name}`}>×</button></div>)}</div><button className="add-plan-button" onClick={addHabit}>＋ 添加自己想记录的习惯</button></div></details>
    <div className="goal-grid">{(["sleep", "exercise", "water"] as Array<keyof Goals>).map((type) => { const meta = TYPE_META[type]; return <article key={type}><span>{meta.icon}</span><small>{meta.name}目标</small><strong>{data.goals[type]} {meta.unit}</strong><button onClick={() => editGoal(type)}>修改目标</button></article>; })}</div>
    <details className="utility-settings"><summary><span>⚙️</span><div><strong>设置</strong><small>显示顺序、备份与隐私</small></div><i>⌄</i></summary><div className="utility-settings-body"><section className="sort-card compact-setting"><div className="settings-heading"><div><span className="section-kicker">显示顺序</span><h3>按住移动按钮上下拖动</h3><p>拖动后，“今天”和“记一笔”会使用同样的顺序。</p></div></div><div className="habit-sort-list">{enabledTypes.map((type) => { const meta = metaFor(type); return <div key={type} data-sort-type={type}><button className="drag-handle" aria-label={`按住拖动${meta.name}`} onPointerDown={(event) => startDrag(type, event)} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onKeyDown={(event) => { if (event.key === "ArrowUp") { event.preventDefault(); moveWithKeyboard(type, -1); } if (event.key === "ArrowDown") { event.preventDefault(); moveWithKeyboard(type, 1); } }}>⠿</button><span>{meta.icon}</span><strong>{meta.name}</strong><small>{kindLabel(meta.kind)}</small></div>; })}</div></section><article className="backup-card compact-setting"><div><span>🧳</span><div><h3>本地数据备份</h3><p>导出一个备份文件；换设备或误删后可以从文件恢复。</p>{data.lastBackupAt && <small>最近备份：{new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(data.lastBackupAt))}</small>}</div></div><div className="backup-actions"><button onClick={exportBackup}>导出备份</button><button onClick={importBackup}>恢复备份</button></div></article><article className="privacy-card compact-setting"><span>🔒</span><div><h3>仅保存在当前设备</h3><p>不会上传健康记录；备份也只由你手动保存和恢复。</p></div></article></div></details>
  </section>;
}

function PlanDialog({ plan, close, save, remove }: { plan: Plan | null; close: () => void; save: (plan: Plan) => void; remove: () => void }) {
  const [icon, setIcon] = useState(plan?.icon ?? "🌱"); const [title, setTitle] = useState(plan?.title ?? ""); const [detail, setDetail] = useState(plan?.detail ?? ""); const [repeat, setRepeat] = useState<PlanRepeat>(plan?.repeat ?? "daily");
  return <Modal close={close} title={plan ? "调整计划" : "新增计划"} kicker="健康计划"><form className="dialog-form" onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; save({ id: plan?.id ?? `plan-${Date.now()}`, icon: icon.trim() || "🌱", title: title.trim(), detail: detail.trim(), repeat, completedDates: plan?.completedDates ?? [], createdDate: plan?.createdDate ?? todayKey() }); }}><label><span>图标</span><input value={icon} onChange={(event) => setIcon(event.target.value)} maxLength={4} /></label><label><span>计划名称</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：晚上散步 20 分钟" required /></label><label><span>小提示</span><input value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="给自己一句温柔的提醒" /></label><label><span>重复方式</span><select value={repeat} onChange={(event) => setRepeat(event.target.value as PlanRepeat)}><option value="daily">每天</option><option value="weekdays">工作日</option><option value="weekends">周末</option><option value="once">仅一次</option></select></label><p className="dialog-tip">完成情况按日期保存，第二天会自动显示为未完成。</p><div className="dialog-actions">{plan && <button className="danger-button" type="button" onClick={remove}>删除</button>}<button className="save-button" type="submit">保存计划</button></div></form></Modal>;
}
function EntryDialog({ entry, types, metaFor, close, save }: { entry: HealthEntry; types: string[]; metaFor: (type: string) => TypeMeta; close: () => void; save: (entry: HealthEntry) => void }) {
  const [type, setType] = useState(entry.type); const [value, setValue] = useState(entry.value); const [time, setTime] = useState(localDateTimeValue(new Date(entry.recordedAt))); const [note, setNote] = useState(entry.note);
  const meta = metaFor(type);
  return <Modal close={close} title="修改历史记录" kicker="本机记录"><form className="dialog-form" onSubmit={(event) => { event.preventDefault(); save({ ...entry, type, value: meta.kind === "text" ? 1 : value, note: note.trim(), unit: meta.unit, recordedAt: new Date(time).toISOString() }); }}><label><span>记录项目</span><select value={type} onChange={(event) => setType(event.target.value)}>{types.map((item) => <option key={item} value={item}>{metaFor(item).name}</option>)}</select></label>{meta.kind === "boolean" ? <label><span>完成状态</span><select value={value} onChange={(event) => setValue(Number(event.target.value))}><option value={1}>已完成</option><option value={0}>未完成</option></select></label> : meta.kind !== "text" && <label><span>{meta.kind === "rating" ? "评分" : "数值"}</span><div className="value-input"><input type="number" min={meta.kind === "rating" ? 1 : 0} max={meta.kind === "rating" ? meta.ratingMax ?? 5 : undefined} step="0.1" value={value} onChange={(event) => setValue(Number(event.target.value))} required /><em>{meta.kind === "rating" ? `/ ${meta.ratingMax ?? 5} 分` : meta.unit}</em></div></label>}<label><span>{meta.kind === "text" ? "文字内容" : "备注"}</span><input value={note} onChange={(event) => setNote(event.target.value)} required={meta.kind === "text"} /></label><label><span>记录时间</span><input type="datetime-local" value={time} onChange={(event) => setTime(event.target.value)} required /></label><button className="save-button" type="submit">保存修改</button></form></Modal>;
}
function HabitDialog({ close, add }: { close: () => void; add: (habit: Habit) => void }) {
  const [icon, setIcon] = useState("🌿"); const [name, setName] = useState(""); const [kind, setKind] = useState<HabitKind>("count"); const [unit, setUnit] = useState("次"); const [direction, setDirection] = useState<GoalDirection>("neutral"); const [goal, setGoal] = useState(0); const [ratingMax, setRatingMax] = useState(5);
  const chooseKind = (next: HabitKind) => { setKind(next); setUnit(({ boolean: "完成", count: "次", duration: "分钟", rating: "分", text: "文字", number: "次" } as const)[next]); if (next === "text") setDirection("neutral"); if (next === "boolean") { setDirection("more"); setGoal(1); } };
  return <Modal close={close} title="建立生活习惯" kicker="自定义记录"><form className="dialog-form" onSubmit={(event) => { event.preventDefault(); if (!name.trim() || !unit.trim()) return; const id = name === "吸烟" ? "smoking" : name === "饮酒" ? "alcohol" : `custom-${Date.now()}`; add({ id, icon: icon.trim() || "🌿", name: name.trim(), unit: unit.trim(), visible: true, builtIn: id === "smoking" || id === "alcohol", kind: id === "smoking" || id === "alcohol" ? "count" : kind, direction: id === "smoking" || id === "alcohol" ? "less" : direction, goal: id === "smoking" || id === "alcohol" ? 0 : direction === "neutral" ? undefined : goal, ratingMax: kind === "rating" ? ratingMax : undefined }); }}><div className="habit-dialog-grid"><label><span>图标</span><input value={icon} onChange={(event) => setIcon(event.target.value)} maxLength={4} /></label><label><span>习惯名称</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：冥想" required /></label></div><label><span>记录类型</span><select value={kind} onChange={(event) => chooseKind(event.target.value as HabitKind)}><option value="boolean">完成 / 未完成</option><option value="count">次数</option><option value="duration">时长</option><option value="rating">评分</option><option value="text">文字</option><option value="number">普通数值</option></select></label><p className="dialog-tip">例如：吃药用完成状态，咖啡用次数，冥想用时长，心情用评分，身体感受用文字。</p>{kind !== "boolean" && kind !== "text" && <label><span>计量单位</span><input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="例如：分钟、次、杯" required /></label>}{kind === "rating" && <label><span>最高评分</span><input type="number" min="3" max="10" value={ratingMax} onChange={(event) => setRatingMax(Number(event.target.value))} /></label>}{kind !== "text" && <><label><span>目标方向</span><select value={direction} onChange={(event) => setDirection(event.target.value as GoalDirection)}><option value="neutral">只观察变化</option><option value="more">越多越接近目标</option><option value="less">越少越好</option></select></label>{direction !== "neutral" && <label><span>每日参考目标</span><div className="value-input"><input type="number" min="0" step="0.1" value={goal} onChange={(event) => setGoal(Number(event.target.value))} /><em>{unit}</em></div></label>}</>}<button className="save-button" type="submit">添加到我的习惯</button></form></Modal>;
}
function DayNoteDialog({ dateKey, value, close, save }: { dateKey: string; value: string; close: () => void; save: (note: string) => void }) {
  const [note, setNote] = useState(value);
  return <Modal close={close} title={`${dateKey} 的备注`} kicker="解释当天变化"><form className="dialog-form" onSubmit={(event) => { event.preventDefault(); save(note); }}><label><span>当天发生了什么</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：感冒、加班、旅行、睡得比较晚" rows={4} /></label><p className="dialog-tip">备注只帮助你理解趋势，不参与健康评分。</p><div className="dialog-actions">{value && <button className="danger-button" type="button" onClick={() => save("")}>清除备注</button>}<button className="save-button" type="submit">保存备注</button></div></form></Modal>;
}
function GoalDialog({ type, value, close, save }: { type: keyof Goals; value: number; close: () => void; save: (value: number) => void }) {
  const [next, setNext] = useState(value); const meta = TYPE_META[type];
  return <Modal close={close} title={`修改${meta.name}目标`} kicker="每日健康目标"><form className="dialog-form" onSubmit={(event) => { event.preventDefault(); save(next); }}><label><span>目标数值</span><div className="value-input"><input type="number" min="0" step={type === "sleep" ? ".1" : "1"} value={next} onChange={(event) => setNext(Number(event.target.value))} /><em>{meta.unit}</em></div></label><p className="dialog-tip">这里只修改每日目标，不会跳转到计划栏目。</p><button className="save-button" type="submit">保存目标</button></form></Modal>;
}
