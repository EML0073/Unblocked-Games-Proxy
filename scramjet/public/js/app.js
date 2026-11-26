import { engine } from "./engine.js";
import { resolveInput, formatForDisplay } from "./url.js";

const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const language = ["en", "es", "eu"].includes(params.get("lang")) ? params.get("lang") : "en";
const dictionaries = {
  en: {
    proxyTag:"PROXY",engine:"SCRAMJET ENGINE",go:"Go",addressPlaceholder:"Search or enter a website address",
    welcomeEyebrow:"YOUR WEB BROWSER",welcomeTitle:"What would you like to explore?",
    welcomeDescription:"Search the web or enter a website address to get started.",search:"Search",
    tip:"Tip: press Ctrl + L to focus the address bar",connecting:"Connecting…",starting:"Starting proxy…",
    reloading:"Reloading…",pageError:"The page could not be loaded: ",proxyError:"Proxy startup failed: ",
    reloadError:"Reload failed: ",blocked:"This address is blocked for security reasons."
  },
  es: {
    proxyTag:"PROXY",engine:"MOTOR SCRAMJET",go:"Ir",addressPlaceholder:"Busca o escribe la dirección de una web",
    welcomeEyebrow:"TU NAVEGADOR WEB",welcomeTitle:"¿Qué te gustaría explorar?",
    welcomeDescription:"Busca en Internet o introduce la dirección de una página para empezar.",search:"Buscar",
    tip:"Consejo: pulsa Ctrl + L para ir a la barra de direcciones",connecting:"Conectando…",starting:"Iniciando el proxy…",
    reloading:"Recargando…",pageError:"No se ha podido cargar la página: ",proxyError:"No se ha podido iniciar el proxy: ",
    reloadError:"Error al recargar: ",blocked:"Esta dirección está bloqueada por motivos de seguridad."
  },
  eu: {
    proxyTag:"PROXY",engine:"SCRAMJET MOTORRA",go:"Joan",addressPlaceholder:"Bilatu edo idatzi webgunearen helbidea",
    welcomeEyebrow:"ZURE WEB NABIGATZAILEA",welcomeTitle:"Zer arakatu nahi duzu?",
    welcomeDescription:"Bilatu Interneten edo idatzi web-orri baten helbidea hasteko.",search:"Bilatu",
    tip:"Aholkua: sakatu Ctrl + L helbide-barrara joateko",connecting:"Konektatzen…",starting:"Proxya abiarazten…",
    reloading:"Birkargatzen…",pageError:"Ezin izan da orria kargatu: ",proxyError:"Ezin izan da proxya abiarazi: ",
    reloadError:"Birkargatze-errorea: ",blocked:"Helbide hau segurtasun-arrazoiengatik blokeatuta dago."
  }
};
const t = (key) => dictionaries[language][key] || dictionaries.en[key] || key;
document.documentElement.lang = language;
document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { node.placeholder = t(node.dataset.i18nPlaceholder); });
const controlLabels = language === "es"
  ? { back:"Atrás", forward:"Adelante", reload:"Recargar", home:"Enfocar la barra de direcciones", address:"Buscar o introducir una dirección" }
  : language === "eu"
    ? { back:"Atzera", forward:"Aurrera", reload:"Birkargatu", home:"Helbide-barra fokuratu", address:"Bilatu edo helbidea idatzi" }
    : { back:"Back", forward:"Forward", reload:"Reload", home:"Focus address bar", address:"Search or enter address" };
for (const [id, label] of Object.entries(controlLabels)) {
  const element = document.getElementById(id);
  if (element) { element.setAttribute("aria-label", label); element.title = label; }
}
const accent = params.get("accent");
if (accent && /^#[0-9a-f]{6}$/i.test(accent)) document.documentElement.style.setProperty("--accent", accent);
if (params.get("theme") === "light") {
  document.documentElement.style.colorScheme = "light";
  document.documentElement.style.setProperty("--page", "#f4f5f7");
  document.documentElement.style.setProperty("--surface", "#ffffff");
  document.documentElement.style.setProperty("--surface-raised", "#edf0f5");
  document.documentElement.style.setProperty("--surface-hover", "#e4e8ef");
  document.documentElement.style.setProperty("--line", "#d9dee7");
  document.documentElement.style.setProperty("--text", "#202124");
  document.documentElement.style.setProperty("--muted", "#626875");
}
const addressBar = $("#address");
const status = $("#status");
const welcome = $("#welcome");
const welcomeSearch = $("#welcomeSearch");
const welcomeAddress = $("#welcomeAddress");
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
  if (existing >= 0) { visitedIndex = existing; return; }
  visited.splice(visitedIndex + 1);
  visited.push(url);
  visitedIndex = visited.length - 1;
};
const canGoBack = () => visitedIndex > 0;
const canGoForward = () => visitedIndex >= 0 && visitedIndex < visited.length - 1;
const render = () => {
  if (!addressBarFocused) addressBar.value = state.url ? formatForDisplay(state.url) : "";
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
    url: (url) => { record(url); render(); },
    loading: () => { state.loading = true; setStatus(t("connecting")); render(); },
    ready: () => { state.loading = false; setStatus(""); render(); },
    error: (error, failedUrl) => {
      state.loading = false;
      const message = error?.message || String(error || "Unknown error");
      setStatus(t("pageError") + message + (failedUrl ? " (" + failedUrl + ")" : ""), "error");
      render();
    },
    escape: (url) => void navigate(url)
  });
  try { session = await sessionPending; return session; }
  finally { sessionPending = null; }
};
const searchTemplate = () => "https://www.google.com/search?q=%s";
const navigate = async (input, options = {}) => {
  const { url, kind } = resolveInput(input, searchTemplate());
  if (kind === "empty") return;
  if (kind === "blocked") { setStatus(t("blocked"), "error"); return; }
  if (kind === "external") { location.assign(url); return; }
  const thisNavigation = ++navigationId;
  state.loading = true;
  welcome.hidden = true;
  setStatus(t("starting"));
  render();
  try {
    const activeSession = await ensureSession();
    if (thisNavigation !== navigationId) return;
    if (options.record === false) state.url = url;
    else record(url);
    activeSession.go(url);
    render();
  } catch (error) {
    if (thisNavigation !== navigationId) return;
    state.loading = false;
    welcome.hidden = !state.url;
    console.error("Scramjet navigation failed:", error);
    setStatus(t("proxyError") + (error?.message || String(error || "Unknown error")), "error");
    render();
  }
};
const goBack = () => { if (!canGoBack()) return; const url = visited[--visitedIndex]; void navigate(url, { record: false }); };
const goForward = () => { if (!canGoForward()) return; const url = visited[++visitedIndex]; void navigate(url, { record: false }); };
welcomeSearch.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = welcomeAddress.value.trim();
  if (!value) return;
  addressBar.value = value;
  addressBar.blur();
  void navigate(value);
});
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
  setStatus(t("reloading"));
  render();
  try { session.reload(); }
  catch (error) { state.loading = false; setStatus(t("reloadError") + (error?.message || String(error)), "error"); render(); }
});
$("#home").addEventListener("click", () => { addressBar.value = ""; addressBar.focus(); addressBar.select(); });
addressBar.addEventListener("focus", () => { addressBarFocused = true; addressBar.select(); });
addressBar.addEventListener("blur", () => { addressBarFocused = false; });
addressBar.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { addressBar.value = state.url ? formatForDisplay(state.url) : ""; addressBar.blur(); }
});
addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() === "l") { event.preventDefault(); addressBar.focus(); addressBar.select(); }
});
render();
