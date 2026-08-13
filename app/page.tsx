"use client";

import { useEffect, useMemo, useState } from "react";

type EntryType = "sleep" | "meal" | "exercise" | "water";

type HealthEntry = {
  id: number;
  type: EntryType;
  value: number;
  unit: string;
  note: string;
  recordedAt: string;
};

const fallbackEntries: HealthEntry[] = [
  { id: -1, type: "sleep", value: 7.4, unit: "小时", note: "深睡 1小时42分", recordedAt: new Date().toISOString() },
  { id: -2, type: "meal", value: 420, unit: "千卡", note: "燕麦、蓝莓和鸡蛋", recordedAt: new Date().toISOString() },
  { id: -3, type: "exercise", value: 38, unit: "分钟", note: "户外快走", recordedAt: new Date().toISOString() },
  { id: -4, type: "water", value: 1200, unit: "ml", note: "今日饮水", recordedAt: new Date().toISOString() },
];

const navItems = [
  { icon: "⌒", label: "今天" },
  { icon: "◎", label: "趋势" },
  { icon: "◇", label: "计划" },
  { icon: "☺", label: "我的" },
];

function formatTime(date: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

export default function Home() {
  const [activeNav, setActiveNav] = useState(0);
  const [entries, setEntries] = useState<HealthEntry[]>(fallbackEntries);
  const [isRecordOpen, setRecordOpen] = useState(false);
  const [recordType, setRecordType] = useState<EntryType>("exercise");
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/entries")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => data.entries?.length && setEntries(data.entries))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const latest = useMemo(() => {
    const find = (type: EntryType) => entries.find((entry) => entry.type === type) ?? fallbackEntries.find((entry) => entry.type === type)!;
    return { sleep: find("sleep"), meal: find("meal"), exercise: find("exercise"), water: find("water") };
  }, [entries]);

  function openRecord(type: EntryType = "exercise") {
    setRecordType(type);
    setRecordOpen(true);
  }

  async function submitRecord(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = Number(form.get("value"));
    const note = String(form.get("note") ?? "");
    const units: Record<EntryType, string> = { sleep: "小时", meal: "千卡", exercise: "分钟", water: "ml" };
    setSaving(true);

    try {
      const response = await fetch("/api/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: recordType, value, unit: units[recordType], note }),
      });
      if (!response.ok) throw new Error("save failed");
      const data = await response.json();
      setEntries((current) => [data.entry, ...current.filter((item) => item.id > 0)]);
    } catch {
      setEntries((current) => [
        { id: Date.now(), type: recordType, value, unit: units[recordType], note, recordedAt: new Date().toISOString() },
        ...current,
      ]);
    } finally {
      setSaving(false);
      setRecordOpen(false);
      setToast("记录已添加 · 你正在让健康变得可见");
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">●</span><span>生息</span></div>
        <nav aria-label="主导航">
          {navItems.map((item, index) => (
            <button key={item.label} className={activeNav === index ? "nav-item active" : "nav-item"} onClick={() => setActiveNav(index)}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-card">
          <span className="mini-label">本周连续</span>
          <strong>5 <small>天</small></strong>
          <p>已经比上周多 2 天</p>
        </div>
        <div className="profile"><span className="avatar">🐷</span><span><strong>早上好，宝宝</strong><small>健康计划进行中</small></span></div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">8月5日 · 星期三</p>
            <h1>今天，身体感觉怎么样？</h1>
          </div>
          <div className="top-actions">
            <button className="icon-button" aria-label="通知">◌<span className="notification-dot" /></button>
            <button className="primary-button" onClick={() => openRecord()}><span>+</span> 记一笔</button>
          </div>
        </header>

        <div className="mobile-date">8月5日 · 星期三</div>

        <section className="hero-grid">
          <article className="score-card">
            <div className="score-copy">
              <span className="section-kicker">今日状态</span>
              <div className="score-line"><strong>82</strong><span>/ 100</span></div>
              <p>你的状态很不错</p>
              <small>睡眠正在稳步改善，今天可以适当增加活动量。</small>
            </div>
            <div className="score-orbit" aria-label="今日健康得分82分">
              <span className="orbit-dot dot-one" /><span className="orbit-dot dot-two" /><span className="orbit-dot dot-three" />
              <div className="orbit-center"><span>状态</span><strong>良好</strong></div>
            </div>
          </article>

          <article className="rhythm-card">
            <div className="card-heading"><span><span className="section-kicker">身体节律</span><h2>近 7 天状态</h2></span><button aria-label="查看趋势">↗</button></div>
            <div className="rhythm-bars" aria-label="近七天健康趋势">
              {[68, 78, 58, 72, 88, 82, 91].map((height, index) => <div key={index} className="bar-column"><span className={index === 6 ? "bar current" : "bar"} style={{ height: `${height}%` }} /><small>{["四", "五", "六", "日", "一", "二", "今"][index]}</small></div>)}
            </div>
          </article>
        </section>

        <div className="section-title"><div><span className="section-kicker">今日记录</span><h2>照顾好每一面</h2></div><button className="text-button">查看全部 <span>→</span></button></div>

        <section className="metric-grid">
          <article className="metric-card sleep-card">
            <div className="metric-top"><span className="metric-icon moon">◐</span><button onClick={() => openRecord("sleep")} aria-label="记录睡眠">+</button></div>
            <span className="section-kicker">睡眠</span>
            <div className="metric-value"><strong>{latest.sleep.value}</strong><span> 小时</span></div>
            <div className="metric-meta"><span><i className="up">↑</i> 比昨天多 36 分钟</span><time>{formatTime(latest.sleep.recordedAt)}</time></div>
            <div className="sleep-track"><span className="deep" /><span className="light" /><span className="awake" /></div>
            <div className="track-legend"><span>入睡 23:18</span><span>醒来 06:42</span></div>
          </article>

          <article className="metric-card food-card">
            <div className="metric-top"><span className="metric-icon leaf">‹</span><button onClick={() => openRecord("meal")} aria-label="记录饮食">+</button></div>
            <span className="section-kicker">饮食</span>
            <div className="metric-value"><strong>{latest.meal.value}</strong><span> 千卡</span></div>
            <div className="metric-meta"><span>今日已摄入</span><span>目标 1,800</span></div>
            <div className="food-progress"><span style={{ width: `${Math.min(100, latest.meal.value / 18)}%` }} /></div>
            <div className="food-tags"><span>蛋白质 24g</span><span>蔬果 2 份</span></div>
          </article>

          <article className="metric-card exercise-card">
            <div className="metric-top"><span className="metric-icon pulse">∿</span><button onClick={() => openRecord("exercise")} aria-label="记录运动">+</button></div>
            <span className="section-kicker">运动</span>
            <div className="metric-value"><strong>{latest.exercise.value}</strong><span> 分钟</span></div>
            <div className="metric-meta"><span><i className="up">↑</i> 已完成日目标 76%</span><span>4.2 km</span></div>
            <div className="activity-row"><span className="activity-icon">↗</span><span><strong>{latest.exercise.note || "户外快走"}</strong><small>平均心率 118 次/分</small></span><time>{formatTime(latest.exercise.recordedAt)}</time></div>
          </article>
        </section>

        <section className="insight-card">
          <span className="spark">✳</span>
          <div><span className="section-kicker">今日建议</span><h3>午后散步 12 分钟</h3><p>你今天的久坐时间稍长。饭后轻快走一小段，会让精神和血糖更平稳。</p></div>
          <button onClick={() => openRecord("exercise")}>加入计划 <span>→</span></button>
        </section>
      </section>

      <nav className="mobile-nav" aria-label="移动导航">
        {navItems.map((item, index) => <button key={item.label} className={activeNav === index ? "active" : ""} onClick={() => setActiveNav(index)}><span>{item.icon}</span>{item.label}</button>)}
      </nav>

      {isRecordOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setRecordOpen(false)}>
          <section className="record-modal" role="dialog" aria-modal="true" aria-labelledby="record-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-heading"><div><span className="section-kicker">快速记录</span><h2 id="record-title">记下这一刻</h2></div><button onClick={() => setRecordOpen(false)} aria-label="关闭">×</button></div>
            <div className="type-tabs">
              {(["sleep", "meal", "exercise", "water"] as EntryType[]).map((type) => <button key={type} className={recordType === type ? "active" : ""} onClick={() => setRecordType(type)}>{{ sleep: "睡眠", meal: "饮食", exercise: "运动", water: "饮水" }[type]}</button>)}
            </div>
            <form onSubmit={submitRecord}>
              <label>
                <span>{{ sleep: "睡眠时长", meal: "摄入热量", exercise: "运动时长", water: "饮水量" }[recordType]}</span>
                <div className="value-input"><input name="value" type="number" min="0" step={recordType === "sleep" ? "0.1" : "1"} defaultValue={{ sleep: 7.5, meal: 520, exercise: 30, water: 300 }[recordType]} required /><em>{{ sleep: "小时", meal: "千卡", exercise: "分钟", water: "ml" }[recordType]}</em></div>
              </label>
              <label><span>备注 <small>可选</small></span><input name="note" placeholder={{ sleep: "例如：夜间醒来一次", meal: "例如：鸡胸肉沙拉", exercise: "例如：户外快走", water: "例如：晨起温水" }[recordType]} /></label>
              <button className="save-button" type="submit" disabled={saving}>{saving ? "正在保存…" : "保存记录"}</button>
            </form>
          </section>
        </div>
      )}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </main>
  );
}
