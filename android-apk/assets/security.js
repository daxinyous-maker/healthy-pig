(function installHealthyPigSecurity(root) {
  "use strict";

  const DEFAULT_AVATARS = ["😊", "🐰", "🐣", "🐻", "🌸", "🌱"];
  const SAFE_IDENTIFIER = /^[A-Za-z0-9_-]{1,48}$/;
  const RESERVED_IDENTIFIERS = new Set(["__proto__", "constructor", "prototype"]);
  const SAFE_DATA_IMAGE = /^data:image\/(?:jpeg|png);base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  const MAX_AVATAR_LENGTH = 3_000_000;

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function safeText(value, fallback = "", maxLength = 500) {
    if (typeof value !== "string") return fallback;
    return value.slice(0, maxLength);
  }

  function safeIdentifier(value, fallback = "") {
    return typeof value === "string" && SAFE_IDENTIFIER.test(value) && !RESERVED_IDENTIFIERS.has(value) ? value : fallback;
  }

  function safeAvatar(value, fallback = DEFAULT_AVATARS[0]) {
    if (DEFAULT_AVATARS.includes(value)) return value;
    if (typeof value !== "string" || value.length > MAX_AVATAR_LENGTH) return fallback;
    return SAFE_DATA_IMAGE.test(value) ? value : fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    })[character]);
  }

  root.HealthyPigSecurity = Object.freeze({
    DEFAULT_AVATARS,
    escapeHtml,
    isRecord,
    safeAvatar,
    safeIdentifier,
    safeText,
  });
})(typeof globalThis === "undefined" ? window : globalThis);
