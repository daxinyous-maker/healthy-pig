import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the healthy pig app", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>健康小猪 · 个人健康管理<\/title>/i);
  assert.match(html, /健康小猪/);
  assert.match(html, /智能输入/);
  assert.match(html, /今天照顾了这些/);
  assert.match(html, /主导航/);
  assert.match(html, /本机私密保存/);
});

test("keeps restored web and mobile features in local source", async () => {
  const [page, css, mobileApp, mobileHtml, mobileCss, agentRules, baseline] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/recovered.css", import.meta.url), "utf8"),
    readFile(new URL("../android-apk/assets/app.js", import.meta.url), "utf8"),
    readFile(new URL("../android-apk/assets/index.html", import.meta.url), "utf8"),
    readFile(new URL("../android-apk/assets/v13.css", import.meta.url), "utf8"),
    readFile(new URL("../AGENTS.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/HEALTHY_PIG_BASELINE.md", import.meta.url), "utf8"),
  ]);

  assert.match(page, /healthy-pig-local-v3/);
  assert.doesNotMatch(page, /fetch\(["']\/api\//);
  assert.match(page, /智能输入/);
  assert.match(page, /增加一项新计划/);
  assert.match(page, /我的习惯/);
  assert.match(page, /修改目标/);
  assert.match(page, /查看详情/);
  assert.match(page, /healthy-pig-local-v4/);
  assert.match(page, /healthy-pig-local-v5/);
  assert.match(page, /本地数据备份/);
  assert.match(page, /全部历史记录/);
  assert.match(page, /completedDates/);
  assert.match(page, /识别后可先修改项目、数值和时间/);
  assert.match(page, /完成 \/ 未完成/);
  assert.match(page, /3 个月/);
  assert.match(page, /日期备注/);
  assert.match(page, /越少越好/);
  assert.match(page, /显示顺序/);
  assert.match(page, /90 天按每 3 天汇总一个点/);
  assert.match(page, /smoothCurve/);
  assert.match(page, /按住移动按钮上下拖动/);
  assert.match(page, /显示顺序、备份与隐私/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /\.modal-backdrop \{ align-items: end/);

  assert.match(mobileApp, /shengxi-offline-v1/);
  assert.match(mobileApp, /removedBuiltins/);
  assert.match(mobileApp, /openNotifications/);
  assert.match(mobileApp, /openSmartDialog/);
  assert.match(mobileApp, /增加一项新计划/);
  assert.match(mobileApp, /我的习惯/);
  assert.match(mobileApp, /openGoalDialog/);
  assert.match(mobileApp, /renderHistory/);
  assert.match(mobileApp, /exportBackup/);
  assert.match(mobileApp, /completedDates/);
  assert.match(mobileApp, /保存前可修改/);
  assert.match(mobileApp, /trendDays/);
  assert.match(mobileApp, /dayNotes/);
  assert.match(mobileApp, /directionLabel/);
  assert.match(mobileApp, /curveMarkup/);
  assert.match(mobileApp, /按住移动按钮上下拖动/);
  assert.match(mobileHtml, /id="goal-dialog"/);
  assert.match(mobileHtml, /id="entry-dialog"/);
  assert.match(mobileHtml, /id="plan-repeat"/);
  assert.match(mobileHtml, /id="habit-kind"/);
  assert.match(mobileHtml, /id="day-note-dialog"/);
  assert.match(mobileCss, /@media \(min-width: 600px\)/);
  assert.match(agentRules, /网页端和手机端是两个都需要完整实现、分别验收的产品端/);
  assert.match(agentRules, /网站默认仅用户本人访问/);
  assert.match(agentRules, /APK 默认只保存在本机/);
  assert.match(baseline, /增加一项新计划/);
  assert.match(baseline, /所有用户新增的习惯必须自动显示在趋势页/);
  assert.match(baseline, /“说一说”“帮我识别”“确认添加”同宽、对齐/);
});

test("natural language parser keeps the spoken date and time", async () => {
  await import(new URL(`../android-apk/assets/parser.js?test=${Date.now()}`, import.meta.url));
  const parser = globalThis.ShengxiParser;
  const results = parser.parse("昨晚睡了 7 小时，午饭吃了一碗牛肉面，下午 3 点散步 30 分钟", []);
  const sleep = results.find((entry) => entry.type === "sleep");
  const meal = results.find((entry) => entry.type === "meal");
  const exercise = results.find((entry) => entry.type === "exercise");
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  assert.equal(new Date(sleep.recordedAt).toDateString(), yesterday.toDateString());
  assert.equal(new Date(sleep.recordedAt).getHours(), 23);
  assert.equal(new Date(meal.recordedAt).getHours(), 12);
  assert.equal(new Date(meal.recordedAt).getMinutes(), 30);
  assert.equal(new Date(exercise.recordedAt).getHours(), 15);
});

test("natural language parser supports flexible custom habits", async () => {
  const parser = globalThis.ShengxiParser;
  const habits = [
    { id: "medicine", name: "吃药", unit: "完成", kind: "boolean" },
    { id: "feeling", name: "身体感受", unit: "文字", kind: "text" },
    { id: "coffee", name: "咖啡", unit: "杯", kind: "count" },
  ];
  const results = parser.parse("早上吃药，咖啡 2 杯，身体感受：喉咙有点干", habits);
  assert.equal(results.find((entry) => entry.type === "medicine").value, 1);
  assert.equal(results.find((entry) => entry.type === "coffee").value, 2);
  assert.match(results.find((entry) => entry.type === "feeling").note, /喉咙有点干/);
});
