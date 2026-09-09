let paginaActual = 1;

const texto = document.getElementById("texto");
const numeroPagina = document.getElementById("numeroPagina");
const mensaje = document.getElementById("mensaje");
const botonChat = document.getElementById("botonChat");
const chatFlotante = document.getElementById("chatFlotante");
const cerrarChat = document.getElementById("cerrarChat");
const chatMensajes = document.getElementById("chatMensajes");
const chatFormulario = document.getElementById("chatFormulario");
const mensajeChat = document.getElementById("mensajeChat");
const libro = document.getElementById("libro");
const abrirLibro = document.getElementById("abrirLibro");

const TOTAL_PAGINAS = 30;
const API_URL = window.ANIBEY_API_URL || "/api/anibey";
const NOMBRE_BASE_DATOS = "anibey_diario";
const VERSION_BASE_DATOS = 1;
const NOMBRE_MENSAJES = "mensajes";
let baseDatos;
let tokenHistorial = 0;
let cambiandoPagina = false;

const palabrasTristes = [
    "triste", "llorar", "lloro", "solo", "sola", "cansada", "cansado",
    "ansiedad", "ansiosa", "ansioso", "mal", "dolor", "extraño", "extrañar",
    "preocupada", "preocupado", "miedo", "agotada", "agotado"
];

function cargarPagina() {
    const contenido =
        localStorage.getItem("anibey_pagina_" + paginaActual);

    texto.value = contenido || "";
    numeroPagina.textContent = paginaActual;

    mensaje.textContent = "";
    cargarHistorialPagina(paginaActual);
}


// Guardar página
function guardar(mostrarMensaje = true) {

    localStorage.setItem(
        "anibey_pagina_" + paginaActual,
        texto.value
    );

    if (!mostrarMensaje) {
        return;
    }

    mensaje.textContent = "✨ ¡Tu página ha sido guardada, princesa! ✨";

    setTimeout(() => {
        mensaje.textContent = "";
    }, 2500);
}


// Página siguiente
function paginaSiguiente() {

    if (cambiandoPagina) {
        return;
    }

    guardar(false);

    if (paginaActual < TOTAL_PAGINAS) {
        animarCambioPagina("siguiente", () => {
            paginaActual++;
            cargarPagina();
        });
    } else {
        mensaje.textContent = "📖 Has llegado al final del libro, mi princesa.";
    }
}


// Página anterior
function paginaAnterior() {

    if (cambiandoPagina) {
        return;
    }

    guardar(false);

    if (paginaActual > 1) {
        animarCambioPagina("anterior", () => {
            paginaActual--;
            cargarPagina();
        });
    } else {
        mensaje.textContent = "👑 Esta es la primera página.";
    }
}

function animarCambioPagina(direccion, cambiarContenido) {
    cambiandoPagina = true;
    libro.classList.add("salida-" + direccion);

    setTimeout(() => {
        cambiarContenido();
        libro.classList.remove("salida-" + direccion);
        libro.classList.add("entrada-" + direccion);

        setTimeout(() => {
            libro.classList.remove("entrada-" + direccion);
            cambiandoPagina = false;
        }, 240);
    }, 240);
}


// Guardar automáticamente mientras escribe
texto.addEventListener("input", () => {

    localStorage.setItem(
        "anibey_pagina_" + paginaActual,
        texto.value
    );

});

function respirar() {
    const respuesta = "Inhala despacio durante cuatro segundos, sostén dos y suelta el aire durante seis. Repite tres veces. Este momento también es tuyo.";
    abrirChat();
    agregarBurbuja(respuesta, "ia");
    guardarInteraccion("🌿 Respirar", respuesta, "herramienta");
}

function mensajeBonito() {
    const mensajes = [
        "No tienes que ser fuerte todo el tiempo. Hoy basta con tratarte con un poquito de ternura.",
        "Lo que sientes importa, pero no define todo lo que eres ni todo lo que está por venir.",
        "Has llegado hasta aquí atravesando días difíciles. Eso habla de una fuerza que quizá hoy no alcanzas a ver."
    ];
    const indice = Math.floor(Math.random() * mensajes.length);
    const respuesta = mensajes[indice];
    abrirChat();
    agregarBurbuja(respuesta, "ia");
    guardarInteraccion("💌 Mensaje bonito", respuesta, "herramienta");
}

async function enviarMensajeChat(evento) {
    evento.preventDefault();
    const contenido = mensajeChat.value.trim();

    if (!contenido) {
        return;
    }

    mensajeChat.value = "";
    abrirChat();
    agregarBurbuja(contenido, "anibey");
    const cargando = agregarBurbuja("Estoy pensando cómo acompañarte...", "ia cargando");
    mensajeChat.disabled = true;

    const textoNormalizado = contenido.toLowerCase();
    const pareceTriste = palabrasTristes.some((palabra) =>
        textoNormalizado.includes(palabra)
    );

    try {
        const historial = await obtenerMemoriaPagina(paginaActual);
        const respuesta = await pedirRespuestaApi(contenido, historial);
        cargando.remove();
        agregarBurbuja(respuesta.texto, "ia");
        await guardarInteraccion(contenido, respuesta.texto, "chat", {
            interpretacion: pareceTriste ? "triste" : "reflexivo",
            proveedor: respuesta.proveedor
        });
    } catch (error) {
        cargando.remove();
        agregarBurbuja(obtenerMensajeErrorApi(error), "ia");
        console.error("No se pudo consultar la API de Anibey:", error);
    } finally {
        mensajeChat.disabled = false;
        mensajeChat.focus();
    }
}

function obtenerMensajeErrorApi(error) {
    const detalle = error.message.toLowerCase();

    if (detalle.includes("429") || detalle.includes("quota") || detalle.includes("limit")) {
        const espera = error.message.match(/retry in ([0-9.]+)s/i);
        const segundos = espera ? Math.ceil(Number(espera[1])) : null;
        return segundos
            ? `La API de Groq está conectada, pero se alcanzó el límite de uso. Espera ${segundos} segundos y vuelve a intentarlo.`
            : "La API de Groq está conectada, pero se alcanzó el límite de uso. Revisa tu cuota de Groq y vuelve a intentarlo.";
    }

    if (detalle.includes("401") || detalle.includes("api key not valid") || detalle.includes("invalid api key")) {
        return "Groq rechazó la clave. Comprueba que GROQ_API_KEY sea válida y esté guardada en el archivo .env.";
    }

    if (detalle.includes("groq_api_key")) {
        return "Falta GROQ_API_KEY en el archivo .env. Pega allí tu clave de Groq y reinicia el servidor.";
    }

    if (detalle.includes("timeout") || detalle.includes("timed out") || detalle.includes("504")) {
        return "Groq tardó demasiado en responder. El mensaje no se perdió; inténtalo otra vez con una pregunta más corta.";
    }

    return "No pude conectar con la API ahora. Revisa que el servidor siga activo e inténtalo de nuevo.";
}

async function pedirRespuestaApi(contenido, historial = []) {
    const respuesta = await fetch(API_URL, {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            message: contenido,
            page: paginaActual,
            language: "es",
            history: historial
        })
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
        throw new Error(datos.error || "La API respondió con el estado " + respuesta.status);
    }

    const textoRespuesta = datos.reply || datos.response || datos.message;

    if (!textoRespuesta) {
        throw new Error("La API no devolvió reply, response ni message.");
    }

    return { texto: textoRespuesta, proveedor: datos.provider || "api" };
}

function crearRespuestaLocal(contenido) {
    const textoNormalizado = contenido.toLowerCase();
    const pareceTriste = palabrasTristes.some((palabra) =>
        textoNormalizado.includes(palabra)
    );

    return pareceTriste
        ? "Te leo, Anibey. Siento que este momento pesa, pero no tienes que atravesarlo sola. Respira despacio y cuéntame un poquito más si te ayuda."
        : "Gracias por contármelo, Anibey. Estoy aquí para escucharte y acompañar lo que quieras escribir.";
}

function nuevoComienzo() {
    paginaActual = 1;
    cargarPagina();
    texto.focus();
    mensaje.textContent = "✨ Un espacio nuevo para empezar a tu manera.";
}

function abrirBaseDatos() {
    return new Promise((resolver, rechazar) => {
        if (!window.indexedDB) {
            rechazar(new Error("IndexedDB no está disponible en este navegador."));
            return;
        }

        const solicitud = window.indexedDB.open(NOMBRE_BASE_DATOS, VERSION_BASE_DATOS);

        solicitud.onupgradeneeded = (evento) => {
            const db = evento.target.result;
            const almacen = db.createObjectStore(NOMBRE_MENSAJES, {
                keyPath: "id",
                autoIncrement: true
            });
            almacen.createIndex("por_pagina", "pagina", { unique: false });
            almacen.createIndex("por_fecha", "createdAt", { unique: false });
        };

        solicitud.onsuccess = () => {
            baseDatos = solicitud.result;
            baseDatos.onversionchange = () => baseDatos.close();
            resolver(baseDatos);
        };

        solicitud.onerror = () => rechazar(solicitud.error);
    });
}

async function guardarMensaje(mensajeDiario) {
    try {
        const db = baseDatos || await abrirBaseDatos();
        const registro = {
            ...mensajeDiario,
            createdAt: new Date().toISOString()
        };

        await new Promise((resolver, rechazar) => {
            const transaccion = db.transaction(NOMBRE_MENSAJES, "readwrite");
            transaccion.objectStore(NOMBRE_MENSAJES).add(registro);
            transaccion.oncomplete = resolver;
            transaccion.onerror = () => rechazar(transaccion.error);
        });

    } catch (error) {
        console.error("No se pudo guardar el mensaje:", error);
    }
}

async function guardarInteraccion(contenido, respuesta, origen, datos = {}) {
    await guardarMensaje({
        contenido,
        fragmento: contenido,
        respuesta,
        pagina: paginaActual,
        origen,
        ...datos
    });
}

async function obtenerMemoriaPagina(pagina) {
    try {
        const db = baseDatos || await abrirBaseDatos();
        const registros = await new Promise((resolver, rechazar) => {
            const transaccion = db.transaction(NOMBRE_MENSAJES, "readonly");
            const indice = transaccion.objectStore(NOMBRE_MENSAJES).index("por_pagina");
            const solicitud = indice.getAll(IDBKeyRange.only(pagina));
            solicitud.onsuccess = () => resolver(solicitud.result);
            solicitud.onerror = () => rechazar(solicitud.error);
        });

        return registros.slice(-6).map((registro) => ({
            message: registro.contenido,
            reply: registro.respuesta
        }));
    } catch (error) {
        console.error("No se pudo leer la memoria de Anibey:", error);
        return [];
    }
}

async function cargarHistorialPagina(pagina) {
    const tokenActual = ++tokenHistorial;
    try {
        const db = baseDatos || await abrirBaseDatos();
        const registros = await new Promise((resolver, rechazar) => {
            const transaccion = db.transaction(NOMBRE_MENSAJES, "readonly");
            const indice = transaccion.objectStore(NOMBRE_MENSAJES).index("por_pagina");
            const solicitud = indice.getAll(IDBKeyRange.only(pagina));
            solicitud.onsuccess = () => resolver(solicitud.result);
            solicitud.onerror = () => rechazar(solicitud.error);
        });

        if (tokenActual !== tokenHistorial || pagina !== paginaActual) {
            return;
        }

        chatMensajes.innerHTML = "";
        agregarBurbuja("Hola, Anibey. Escribe en tu página y guardaré cada mensaje para acompañarte mejor. 🌙", "ia");
        registros.slice(-8).forEach((registro) => {
            agregarBurbuja(registro.fragmento, "anibey");
            agregarBurbuja(registro.respuesta, "ia");
        });
    } catch (error) {
        console.error("No se pudo cargar el historial:", error);
    }
}

function abrirChat() {
    chatFlotante.hidden = false;
    botonChat.setAttribute("aria-expanded", "true");
}

function cerrarVentanaChat() {
    chatFlotante.hidden = true;
    botonChat.setAttribute("aria-expanded", "false");
    botonChat.focus();
}

function agregarBurbuja(contenido, tipo) {
    const burbuja = document.createElement("div");
    burbuja.className = "burbuja burbuja-" + tipo;
    burbuja.textContent = contenido;
    chatMensajes.appendChild(burbuja);
    chatMensajes.scrollTop = chatMensajes.scrollHeight;
    return burbuja;
}

botonChat.addEventListener("click", () => {
    if (chatFlotante.hidden) {
        abrirChat();
    } else {
        cerrarVentanaChat();
    }
});

cerrarChat.addEventListener("click", cerrarVentanaChat);
chatFormulario.addEventListener("submit", enviarMensajeChat);

document.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape" && !chatFlotante.hidden) {
        cerrarVentanaChat();
    }
});

document.addEventListener("click", (evento) => {
    if (
        !chatFlotante.hidden &&
        !chatFlotante.contains(evento.target) &&
        !botonChat.contains(evento.target)
    ) {
        cerrarVentanaChat();
    }
});

abrirLibro.addEventListener("click", () => {
    libro.classList.add("contando");
    libro.classList.remove("cerrado");
    libro.classList.add("abierto");
    libro.setAttribute("aria-label", "Libro de Anibey abierto");
    abrirLibro.setAttribute("aria-hidden", "true");
    abrirLibro.disabled = true;
    setTimeout(() => texto.focus(), 650);
});


// Iniciar
abrirBaseDatos().catch((error) => {
    console.error("No se pudo abrir la base de datos:", error);
});
cargarPagina();
