export function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export function safeUrl(value, fallback = "#") {
    try {
        const url = new URL(String(value || ""), window.location.href);
        if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    } catch (_) {}
    return fallback;
}

export function formatTimestamp(value) {
    if (!value) return "—";
    try {
        if (typeof value.toDate === "function") return value.toDate().toLocaleString();
        return new Date(value).toLocaleString();
    } catch (_) {
        return "—";
    }
}
