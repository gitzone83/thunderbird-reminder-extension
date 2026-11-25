// Shared by extension pages and the background page. Thunderbird handles locale
// selection and fallback to default_locale; no separate language preference needed.
const I18n = (() => {
  const locale = browser.i18n.getUILanguage();
  const relativeTime = new Intl.RelativeTimeFormat(locale, { numeric: "always" });

  function message(key, substitutions) {
    return browser.i18n.getMessage(key, substitutions);
  }

  function localizeDocument(root = document) {
    root.documentElement.lang = locale;
    root.documentElement.dir = browser.i18n.getMessage("@@bidi_dir") || "ltr";
    for (const element of root.querySelectorAll("[data-i18n]")) {
      element.textContent = message(element.dataset.i18n);
    }
    for (const attribute of ["title", "placeholder", "aria-label"]) {
      for (const element of root.querySelectorAll(`[data-i18n-${attribute}]`)) {
        element.setAttribute(attribute, message(element.getAttribute(`data-i18n-${attribute}`)));
      }
    }
  }

  function formatDateTime(date, includeYear = false, now = new Date()) {
    const time = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    if (date.toDateString() === now.toDateString()) {
      return message("todayAt", time);
    }
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) {
      return message("tomorrowAt", time);
    }
    const options = { month: "short", day: "numeric" };
    if (includeYear) options.year = "numeric";
    return message("dateAtTime", [date.toLocaleDateString(locale, options), time]);
  }

  function formatRelativeTime(date, now = new Date()) {
    const delta = date - now;
    const magnitude = Math.abs(delta);
    // Preserve future/past direction even within the current minute. Round future
    // values up and elapsed values down, without rounding hours before choosing units.
    const unit = magnitude < 3600000 ? "minute" : magnitude < 86400000 ? "hour" : "day";
    const divisor = { minute: 60000, hour: 3600000, day: 86400000 }[unit];
    const value = delta > 0 ? Math.ceil(delta / divisor) : -Math.floor(magnitude / divisor);
    return relativeTime.format(value, unit);
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", () => localizeDocument());
  }
  return { message, localizeDocument, formatDateTime, formatRelativeTime };
})();
