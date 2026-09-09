const http = require("http");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const PORT = Number(process.env.PORT) || 3000;
const GROQ_MODEL = "qwen/qwen3.8-27b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const PUBLIC_FILES = {
    "/": { file: "index.html", type: "text/html; charset=utf-8" },
    "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
    "/style.css": { file: "style.css", type: "text/css; charset=utf-8" },
    "/script.js": { file: "script.js", type: "text/javascript; charset=utf-8" }
};

function sendJson(response, status, body, extraHeaders = {}) {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        ...extraHeaders
    });
    response.end(JSON.stringify(body));
}

function readBody(request) {
    return new Promise((resolve, reject) => {
        let body = "";
        request.on("data", (chunk) => {
            body += chunk;
            if (body.length > 100000) {
                reject(new Error("El mensaje es demasiado grande."));
                request.destroy();
            }
        });
        request.on("end", () => resolve(body));
        request.on("error", reject);
    });
}

async function responderConGroq(message, page, history = []) {
    if (!process.env.GROQ_API_KEY) {
        throw new Error("Falta configurar GROQ_API_KEY en el archivo .env.");
    }

    const groqResponse = await fetch(GROQ_URL, {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [
                {
                    role: "system",
                    content: "Eres la asistente de Anibey. Responde cualquier pregunta en español con claridad, calidez y brevedad. Adapta la respuesta al tema, no inventes datos y explica cuando no tengas certeza. Si menciona hacerse daño o estar en peligro, recomienda contactar inmediatamente a emergencias o a una persona de confianza y pregunta si está a salvo."
                },
                ...history.slice(-6).flatMap((item) => [
                    { role: "user", content: String(item.message || "") },
                    { role: "assistant", content: String(item.reply || "") }
                ]),
                {
                    role: "user",
                    content: `Página ${page || 1}. Mensaje de Anibey:\n${message}`
                }
            ],
            max_tokens: 120,
            temperature: 0.7
        })
    });

    const data = await groqResponse.json();
    if (!groqResponse.ok) {
        const detail = data.error && data.error.message ? data.error.message : "Error de Groq.";
        const error = new Error(detail);
        error.groqStatus = groqResponse.status;
        const espera = detail.match(/retry(?: after| in)\s*([0-9.]+)s?/i);
        error.retryAfter = espera ? Math.ceil(Number(espera[1])) : undefined;
        throw error;
    }

    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
        throw new Error("Groq no devolvió una respuesta de texto.");
    }

    return reply;
}

const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "POST" && requestUrl.pathname === "/api/anibey") {
        try {
            const payload = JSON.parse(await readBody(request));
            const message = typeof payload.message === "string" ? payload.message.trim() : "";
            const page = Number(payload.page) || 1;
            const history = Array.isArray(payload.history) ? payload.history.slice(-6) : [];

            if (!message) {
                sendJson(response, 400, { error: "El mensaje está vacío." });
                return;
            }

            const reply = await responderConGroq(message, page, history);
            sendJson(response, 200, { reply, provider: "groq" });
        } catch (error) {
            const status = error.name === "TimeoutError"
                ? 504
                : error.groqStatus === 400 || error.groqStatus === 401 || error.groqStatus === 403 || error.groqStatus === 429
                ? error.groqStatus
                : 500;
            const headers = status === 429 && error.retryAfter
                ? { "Retry-After": String(error.retryAfter) }
                : undefined;
            sendJson(response, status, { error: error.message || "No se pudo responder.", retryAfter: error.retryAfter }, headers);
        }
        return;
    }

    if (request.method !== "GET") {
        sendJson(response, 405, { error: "Método no permitido." });
        return;
    }

    const publicFile = PUBLIC_FILES[requestUrl.pathname];
    if (!publicFile) {
        sendJson(response, 404, { error: "Recurso no encontrado." });
        return;
    }

    const filePath = path.join(__dirname, publicFile.file);
    fs.readFile(filePath, (error, content) => {
        if (error) {
            sendJson(response, 500, { error: "No se pudo leer el recurso." });
            return;
        }
        response.writeHead(200, { "Content-Type": publicFile.type });
        response.end(content);
    });
});

server.listen(PORT, () => {
    console.log(`Anibey está disponible en http://localhost:${PORT}`);
});
