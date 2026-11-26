import { engine } from "./engine.js";
import { resolveInput, formatForDisplay } from "./url.js";

const $ = (selector) => document.querySelector(selector);
const addressBar = $("#address");
const status = $("#status");
const frame = document.createElement("iframe");

frame.className = "frame frame--active";
frame.title = "Proxied website";
frame.allow = "cross-origin-isolated; fullscreen; autoplay; clipboard-read; clipboard-write";
frame.referrerPolicy = "no-referrer";
$("#frames").append(frame);

let session = null;
let sessionPending = null;
let addressBarFocused = false;
let navigationId = 0;

const state = { url: "", loading: false };
const visited = [];
let visitedIndex = -1;

const setStatus = (message, type = "info") => {
    status.textContent = message || "";
    status.hidden = !message;
    status.dataset.type = type;
};

const record = (url) => {
    state.url = url;
    if (visited[visitedIndex] === url) return;
    const existing = visited.lastIndexOf(url, visitedIndex - 1);
    if (existing >= 0) {
        visitedIndex = existing;
        return;
    }
    visited.splice(visitedIndex + 1);
    visited.push(url);
    visitedIndex = visited.length - 1;
};

const canGoBack = () => visitedIndex > 0;
const canGoForward = () => visitedIndex >= 0 && visitedIndex < visited.length - 1;

const render = () => {
    if (!addressBarFocused) {
        addressBar.value = state.url ? formatForDisplay(state.url) : "";
    }
    $("#back").disabled = !canGoBack();
    $("#forward").disabled = !canGoForward();
    $("#reload").disabled = !session || state.loading;
    $("#go").disabled = state.loading;
    $("#loadingBar").classList.toggle("is-visible", state.loading);
};

const ensureSession = async () => {
    if (session) return session;
    if (sessionPending) return sessionPending;

    sessionPending = engine.createSession(frame, {
        url: (url) => {
            record(url);
            render();
        },
        loading: () => {
            state.loading = true;
            setStatus("Connecting…");
            render();
        },
        ready: () => {
            state.loading = false;
            setStatus("");
            render();
        },
        error: (error, failedUrl) => {
            state.loading = false;
            const message = error?.message || String(error || "Unknown error");
            const target = failedUrl ? " (" + failedUrl + ")" : "";
            setStatus("The page could not be loaded: " + message + target, "error");
            render();
        },
        escape: (url) => void navigate(url)
    });

    try {
        session = await sessionPending;
        return session;
    } finally {
        sessionPending = null;
    }
};

const searchTemplate = () => "https://duckduckgo.com/?q=%s";

const navigate = async (input, options = {}) => {
    const { url, kind } = resolveInput(input, searchTemplate());

    if (kind === "empty") return;
    if (kind === "blocked") {
        setStatus("This address is blocked for security reasons.", "error");
        return;
    }
    if (kind === "external") {
        location.assign(url);
        return;
    }

    const thisNavigation = ++navigationId;
    state.loading = true;
    setStatus("Starting proxy…");
    render();

    try {
        const activeSession = await ensureSession();
        if (thisNavigation !== navigationId) return;

        if (options.record === false) {
            state.url = url;
        } else {
            record(url);
        }

        activeSession.go(url);
        render();
    } catch (error) {
        if (thisNavigation !== navigationId) return;
        state.loading = false;
        console.error("Scramjet navigation failed:", error);
        const message = error?.message || String(error || "Unknown error");
        setStatus("Proxy startup failed: " + message, "error");
        render();
    }
};

const goBack = () => {
    if (!canGoBack()) return;
    const url = visited[--visitedIndex];
    void navigate(url, { record: false });
};

const goForward = () => {
    if (!canGoForward()) return;
    const url = visited[++visitedIndex];
    void navigate(url, { record: false });
};

$("#omnibox").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = addressBar.value.trim();
    addressBar.blur();
    void navigate(value);
});

$("#back").addEventListener("click", goBack);
$("#forward").addEventListener("click", goForward);
$("#reload").addEventListener("click", () => {
    if (!session) return;
    state.loading = true;
    setStatus("Reloading…");
    render();
    try {
        session.reload();
    } catch (error) {
        state.loading = false;
        setStatus("Reload failed: " + (error?.message || String(error)), "error");
        render();
    }
});

$("#home").addEventListener("click", () => {
    addressBar.value = "";
    addressBar.focus();
    addressBar.select();
});

addressBar.addEventListener("focus", () => {
    addressBarFocused = true;
    addressBar.select();
});
addressBar.addEventListener("blur", () => {
    addressBarFocused = false;
});
addressBar.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        addressBar.value = state.url ? formatForDisplay(state.url) : "";
        addressBar.blur();
    }
});

addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        addressBar.focus();
        addressBar.select();
    }
});

render();
