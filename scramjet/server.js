import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createRequire } from "node:module";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(__dirname, "public");
const app = express();
app.use((_req, res, next) => {
    // Intentionally send no cross-origin isolation, resource isolation, or
    // frame-embedding restrictions. This allows embedding in nested iframes
    // (including third-party launchers such as Google Sites).
    for (const header of [
        "Cross-Origin-Opener-Policy",
        "Cross-Origin-Embedder-Policy",
        "Cross-Origin-Resource-Policy",
        "Origin-Agent-Cluster",
        "Content-Security-Policy",
        "Content-Security-Policy-Report-Only",
        "X-Frame-Options"
    ]) {
        res.removeHeader(header);
    }
    next();
});
const require = createRequire(import.meta.url);
const dirOf = (specifier) => path.dirname(require.resolve(specifier));
app.use("/scram/", express.static(scramjetPath));
app.use("/utils/", express.static(dirOf("@mercuryworkshop/scramjet-utils")));
app.use("/controller/", express.static(dirOf("@mercuryworkshop/scramjet-controller")));
app.use("/libcurl/", express.static(dirOf("@mercuryworkshop/libcurl-transport")));

// Lightweight endpoint for Render health checks and uptime monitors.
app.get("/healthz", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
        status: "ok",
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

app.use(express.static(staticRoot, {
    setHeaders(res, filePath) {
        if (path.basename(filePath).endsWith("sw.js")) {
            res.setHeader("Cache-Control", "no-cache");
        }
    }
}));
const handleRequest = (req, res) => {
    app(req, res);
};
const server = http.createServer(handleRequest);
server.on("upgrade", (req, socket, head) => {
    const wispPath = new URL(req.url ?? "/", "http://localhost").pathname;
    if (wispPath === "/wisp/") {
        req.url = wispPath;
        wisp.routeRequest(req, socket, head);
        return;
    }
    socket.end();
});
const listenWithFallback = (target, startPort, attempts = 20) => {
    let port = startPort;
    let left = attempts;
    const onError = (error) => {
        if (error.code !== "EADDRINUSE" || left-- <= 0) {
            console.error(`Could not listen on port ${port}: ${error.message}`);
            process.exit(1);
        }
        console.warn(`Port ${port} is in use, trying ${port + 1}...`);
        port += 1;
        target.listen(port);
    };
    target.on("error", onError);
    target.listen(port, () => {
        target.off("error", onError);
        process.send?.({ type: "listening", port });
        console.log(process.env.BACKEND_ONLY
            ? `Backend listening on http://localhost:${port}`
            : `My Minimal Proxy listening on http://localhost:${port}`);
    });
};
// Keep upgraded WebSocket connections (Wisp) alive; they carry proxied traffic.
server.timeout = 0;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 300000;

const port = Number(process.env.PORT) || 8080;
listenWithFallback(server, port);
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => server.close(() => process.exit(0)));
}
