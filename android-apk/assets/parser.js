(function (global) {
  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function estimate(food, amount, unit) {
    const table = [
      [["米饭", "粥"], 116], [["面", "粉"], 137], [["鸡蛋", "蛋"], 144],
      [["鸡肉", "鸡胸"], 165], [["牛肉"], 250], [["鱼", "虾"], 120],
      [["牛奶"], 54], [["酸奶"], 72], [["面包"], 265], [["饺子", "包子"], 220],
      [["沙拉", "蔬菜"], 80], [["水果", "苹果", "香蕉", "橙"], 60],
    ];
    const per100g = (table.find((item) => item[0].some((word) => food.includes(word))) || [null, 120])[1];
    const grams = amount * ({ 克: 1, 毫升: 1, 份: 250, 碗: 300, 个: 80 }[unit] || 1);
    return Math.max(0, Math.round(per100g * grams / 100));
  }

  function sentenceAt(text, index) {
    const before = text.slice(0, index);
    const after = text.slice(index);
    const start = Math.max(before.lastIndexOf("，"), before.lastIndexOf("。"), before.lastIndexOf("；"), before.lastIndexOf("\n")) + 1;
    const offsets = [after.indexOf("，"), after.indexOf("。"), after.indexOf("；"), after.indexOf("\n")].filter((value) => value >= 0);
    return text.slice(start, index + (offsets.length ? Math.min(...offsets) : after.length)).trim();
  }

  function inferRecordedAt(context, type, baseDate) {
    const date = baseDate ? new Date(baseDate) : new Date();
    if (/前天/.test(context)) date.setDate(date.getDate() - 2);
    else if (/昨天|昨日|昨晚|昨早/.test(context)) date.setDate(date.getDate() - 1);
    let hour = date.getHours();
    let minute = date.getMinutes();
    const explicit = context.match(/(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})\s*(?:[:：点时])\s*(半|\d{1,2})?/);
    if (explicit) {
      hour = Math.min(23, Number(explicit[2]));
      minute = explicit[3] === "半" ? 30 : Math.min(59, Number(explicit[3] || 0));
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

  function parse(text, customHabits) {
    const results = [];
    const add = (type, value, unit, note, context) => results.push({ type, value: Math.round(value * 10) / 10, unit, note, recordedAt: inferRecordedAt(context || note, type) });
    for (const match of text.matchAll(/(?:睡了|睡眠(?:了|是)?)[^\d]{0,5}(\d+(?:\.\d+)?)\s*(?:个?小时|钟头)/g)) add("sleep", Number(match[1]), "小时", match[0], sentenceAt(text, match.index || 0));
    for (const match of text.matchAll(/(?:运动|跑步|散步|快走|瑜伽|骑行)[^\d]{0,8}(\d+(?:\.\d+)?)\s*(分钟|分|小时)/g)) add("exercise", Number(match[1]) * (match[2] === "小时" ? 60 : 1), "分钟", match[0], sentenceAt(text, match.index || 0));
    for (const match of text.matchAll(/(?:喝水|饮水)[^\d]{0,6}(\d+(?:\.\d+)?)\s*(ml|毫升|升|l)/gi)) add("water", Number(match[1]) * (/升|l/i.test(match[2]) && !/毫升/i.test(match[2]) ? 1000 : 1), "ml", match[0], sentenceAt(text, match.index || 0));
    for (const match of text.matchAll(/(?:抽烟|吸烟)[^\d]{0,5}(\d+(?:\.\d+)?)\s*根/g)) add("smoking", Number(match[1]), "根", match[0], sentenceAt(text, match.index || 0));
    for (const match of text.matchAll(/(?:喝酒|饮酒|啤酒|红酒|白酒)[^\d]{0,6}(\d+(?:\.\d+)?)\s*(?:杯|瓶|两)/g)) add("alcohol", Number(match[1]), "杯", match[0], sentenceAt(text, match.index || 0));
    const mealSegments = text.split(/[，。；;\n]/).filter((segment) => /(?:早餐|早饭|午餐|午饭|晚餐|晚饭|夜宵|吃了|吃的)/.test(segment));
    mealSegments.forEach((segment) => {
      const portion = segment.match(/(\d+(?:\.\d+)?)\s*(份|碗|个|克|毫升)/);
      const amount = portion ? Number(portion[1]) : 1;
      const portionUnit = portion ? portion[2] : "份";
      add("meal", estimate(segment, amount, portionUnit), "千卡", `${segment.trim()} · 约${amount}${portionUnit}`, segment);
    });
    (customHabits || []).forEach((habit) => {
      if (habit.kind === "boolean" && text.includes(habit.name)) {
        const index = text.indexOf(habit.name);
        const context = sentenceAt(text, index);
        const undone = new RegExp(`(?:没|没有|未)(?:有)?[^，。；]{0,5}${escapeRegex(habit.name)}`).test(context);
        add(habit.id, undone ? 0 : 1, habit.unit, context, context);
        return;
      }
      if (habit.kind === "text") {
        const pattern = new RegExp(`${escapeRegex(habit.name)}(?:是|[:：])?([^，。；\\n]+)`);
        const match = text.match(pattern);
        if (match) add(habit.id, 1, habit.unit, match[1].trim(), sentenceAt(text, match.index || 0));
        return;
      }
      const pattern = new RegExp(`${escapeRegex(habit.name)}[^\\d]{0,8}(\\d+(?:\\.\\d+)?)\\s*(?:${escapeRegex(habit.unit)})?`, "g");
      for (const match of text.matchAll(pattern)) add(habit.id, Number(match[1]), habit.unit, match[0], sentenceAt(text, match.index || 0));
    });
    return results;
  }

  global.ShengxiParser = { estimate, inferRecordedAt, parse };
})(typeof window === "undefined" ? globalThis : window);
