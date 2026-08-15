// CONFIGURACIÓN DE FIREBASE PARA ESTACIÓN FÚTBOL
const firebaseConfig = {
    databaseURL: "https://cipres-control-default-rtdb.firebaseio.com/"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Nodos de Firebase
const refTurnos = database.ref("ESTACION_FUTBOL/turnos");
const refClientes = database.ref("ESTACION_FUTBOL/clientes");
const refCajaOperaciones = database.ref("ESTACION_FUTBOL/caja_operaciones");

// Variables globales
let turnosData = {};
let clientesData = {};

document.addEventListener("DOMContentLoaded", () => {
    const hoyStr = strFechaHoy();
    
    const inputHora = document.getElementById("hora-turno");
    if (inputHora) inputHora.setAttribute("step", "3600");

    if (document.getElementById("fecha-turno")) document.getElementById("fecha-turno").value = hoyStr;
    if (document.getElementById("filtro-fecha")) document.getElementById("filtro-fecha").value = hoyStr;
    if (document.getElementById("filtro-mes")) document.getElementById("filtro-mes").value = hoyStr.substring(0, 7);

    escucharTurnos();
    escucharClientes();
    actualizarMontoSegunCancha();

    // Listeners de Formulario y Caja
    if (document.getElementById("form-turno")) document.getElementById("form-turno").addEventListener("submit", guardarTurno);
    if (document.getElementById("form-cliente")) document.getElementById("form-cliente").addEventListener("submit", guardarCliente);
    if (document.getElementById("filtro-fecha")) document.getElementById("filtro-fecha").addEventListener("change", renderTablaTurnos);
    if (document.getElementById("search-cliente")) document.getElementById("search-cliente").addEventListener("input", renderTablaClientes);
    if (document.getElementById("filtro-mes")) document.getElementById("filtro-mes").addEventListener("change", calcularEstadisticasCaja);

    if (document.getElementById("btn-guardar-caja-inicial")) {
        document.getElementById("btn-guardar-caja-inicial").addEventListener("click", guardarMontoInicialCaja);
    }
    if (document.getElementById("form-retiro-caja")) {
        document.getElementById("form-retiro-caja").addEventListener("submit", registrarRetiroCaja);
    }
});

function switchTab(tabName) {
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));

    if (window.event && window.event.currentTarget) {
        window.event.currentTarget.classList.add("active");
    }
    const tabEl = document.getElementById(`tab-${tabName}`);
    if (tabEl) tabEl.classList.add("active");
}

// Obtener cancha seleccionada de los botones cuadrados
function obtenerCanchaSeleccionada() {
    const radio = document.querySelector('input[name="cancha-radio"]:checked');
    return radio ? radio.value : "1";
}

function actualizarMontoSegunCancha() {
    const cancha = obtenerCanchaSeleccionada();
    const inputTotal = document.getElementById("total-monto");
    if (!inputTotal) return;

    if (cancha === "1" || cancha === "2") {
        inputTotal.value = 35000;
    } else if (cancha === "3") {
        inputTotal.value = 70000;
    }
}

// -------------------------------------------------------------
// 1. GESTIÓN DE TURNOS
// -------------------------------------------------------------

function escucharTurnos() {
    refTurnos.on("value", (snapshot) => {
        turnosData = snapshot.val() || {};
        actualizarEstadoCanchasTiempoReal();
        renderTablaTurnos();
        renderTablaTurnosFijos();
        calcularEstadisticasCaja();
    });
}

function guardarTurno(e) {
    e.preventDefault();

    const cancha = obtenerCanchaSeleccionada();
    const fecha = document.getElementById("fecha-turno").value;
    const hora = document.getElementById("hora-turno").value;
    const nombre = document.getElementById("cliente-nombre").value.trim();
    const telefono = document.getElementById("cliente-tel").value.trim();
    const sena = parseFloat(document.getElementById("sena-monto").value) || 0;
    const total = parseFloat(document.getElementById("total-monto").value) || 0;
    const fijo = document.getElementById("turno-fijo").checked;

    if (!hora || !hora.includes(":")) {
        mostrarAlertaEstetica("⚠️ Formato Inválido", "Ingresa un horario válido.");
        return;
    }

    const [horas, minutos] = hora.split(":");
    if (minutos !== "00") {
        mostrarAlertaEstetica("⏰ Horario no permitido", `Las reservas deben ser en **horas en punto** (ej: ${horas}:00).`);
        document.getElementById("hora-turno").value = `${horas}:00`;
        return;
    }

    const diaSemanaSeleccionado = obtenerDiaSemana(fecha);
    const listaTurnos = Object.values(turnosData);

    const turnoOcupado = listaTurnos.find(t => {
        if (t.cancha !== cancha || t.hora !== hora) return false;
        if (t.fecha === fecha) return true;
        if (t.fijo && obtenerDiaSemana(t.fecha) === diaSemanaSeleccionado) return true;
        return false;
    });

    if (turnoOcupado) {
        mostrarAlertaEstetica("⛔ Cancha Ocupada", `La **Cancha ${cancha}** a las **${hora} hs** ya está alquilada por **${turnoOcupado.clienteNombre}**.`);
        return;
    }

    const nuevoTurno = {
        cancha, fecha, hora,
        clienteNombre: nombre,
        clienteTel: telefono,
        sena, montoTotal: total,
        fijo, pagado: false,
        timestamp: Date.now()
    };

    autoGuardarCliente(nombre, telefono);

    refTurnos.push(nuevoTurno, (error) => {
        if (!error) {
            mostrarAlertaEstetica("✅ Reserva Exitosa", `Turno agendado para ${nombre} a las ${hora} hs.`);
            document.getElementById("form-turno").reset();
            document.getElementById("fecha-turno").value = strFechaHoy();
            actualizarMontoSegunCancha();
        }
    });
}

function renderTablaTurnos() {
    const tbody = document.getElementById("tabla-turnos-body");
    if (!tbody) return;

    const fechaFiltro = document.getElementById("filtro-fecha").value;
    const diaSemanaFiltro = obtenerDiaSemana(fechaFiltro);
    tbody.innerHTML = "";

    const keys = Object.keys(turnosData);
    const turnosFiltrados = keys
        .map(key => ({ id: key, ...turnosData[key] }))
        .filter(t => t.fecha === fechaFiltro || (t.fijo && obtenerDiaSemana(t.fecha) === diaSemanaFiltro))
        .sort((a, b) => a.hora.localeCompare(b.hora));

    if (turnosFiltrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-muted);">No hay turnos registrados para esta fecha</td></tr>`;
        return;
    }

    turnosFiltrados.forEach(t => {
        const tr = document.createElement("tr");
        const tipoCanchaText = t.cancha === "3" ? "F7" : "F5";
        const pagadoTag = t.pagado 
            ? `<span class="badge-tag tag-pagado">✅ PAGADO</span>` 
            : `<span class="badge-tag tag-pendiente">⏳ PENDIENTE</span>`;
        const tipoTurnoTag = t.fijo 
            ? `<span class="badge-tag tag-fijo">Fijo</span>` 
            : `<span class="badge-tag tag-espontaneo">Espontáneo</span>`;

        tr.innerHTML = `
            <td><strong>${t.hora} hs</strong></td>
            <td>Cancha ${t.cancha} (${tipoCanchaText})</td>
            <td><strong>${t.clienteNombre}</strong><br><small style="color:var(--text-muted);">${t.clienteTel}</small></td>
            <td>Seña: $${t.sena}<br><strong>Total: $${t.montoTotal}</strong></td>
            <td>${tipoTurnoTag}</td>
            <td>${pagadoTag}</td>
            <td>
                <button onclick="togglePagoTurno('${t.id}', ${!t.pagado})" class="btn btn-sm ${t.pagado ? 'btn-warning' : 'btn-success'}">
                    ${t.pagado ? 'Pendiente' : 'Cobrar'}
                </button>
                <button onclick="confirmarEliminarTurno('${t.id}')" class="btn btn-sm btn-danger">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderTablaTurnosFijos() {
    const tbody = document.getElementById("tabla-fijos-body");
    if (!tbody) return;

    tbody.innerHTML = "";
    const nombresDias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

    const turnosFijos = Object.keys(turnosData)
        .map(key => ({ id: key, ...turnosData[key] }))
        .filter(t => t.fijo)
        .sort((a, b) => a.hora.localeCompare(b.hora));

    if (turnosFijos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted); padding: 24px;">No hay turnos fijos recurrentes activos</td></tr>`;
        return;
    }

    turnosFijos.forEach(t => {
        const diaNombre = nombresDias[obtenerDiaSemana(t.fecha)];
        const tipoCancha = t.cancha === "3" ? "F7" : "F5";
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td><strong>${diaNombre}s</strong> — ${t.hora} hs</td>
            <td>Cancha ${t.cancha} (${tipoCancha})</td>
            <td><strong>${t.clienteNombre}</strong></td>
            <td>📱 ${t.clienteTel}</td>
            <td><strong>$${t.montoTotal}</strong></td>
            <td>
                <button onclick="confirmarEliminarTurno('${t.id}')" class="btn btn-sm btn-danger">🗑️ Eliminar Fijo</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function togglePagoTurno(id, nuevoEstado) {
    refTurnos.child(id).update({ pagado: nuevoEstado }, () => {
        if (turnosData[id]) turnosData[id].pagado = nuevoEstado;
        renderTablaTurnos();
        calcularEstadisticasCaja();
    });
}

function confirmarEliminarTurno(id) {
    mostrarConfirmacionEstetica("🗑️ Cancelar Turno", "¿Estás seguro de que deseas eliminar este turno?", () => {
        refTurnos.child(id).remove();
    });
}

function actualizarEstadoCanchasTiempoReal() {
    const hoyStr = strFechaHoy();
    const diaHoy = obtenerDiaSemana(hoyStr);
    const ahora = new Date();
    const horaActualMinutos = ahora.getHours() * 60 + ahora.getMinutes();

    [1, 2, 3].forEach(canchaNum => {
        const badge = document.getElementById(`badge-cancha-${canchaNum}`);
        const info = document.getElementById(`info-cancha-${canchaNum}`);

        if (!badge || !info) return;

        const turnoActivo = Object.values(turnosData).find(t => {
            if (parseInt(t.cancha) !== canchaNum) return false;
            const esMismaFecha = t.fecha === hoyStr;
            const esFijoHoy = t.fijo && obtenerDiaSemana(t.fecha) === diaHoy;

            if (!esMismaFecha && !esFijoHoy) return false;

            const [h, m] = t.hora.split(":").map(Number);
            const inicioMinutos = h * 60 + m;
            return horaActualMinutos >= inicioMinutos && horaActualMinutos < (inicioMinutos + 60);
        });

        if (turnoActivo) {
            badge.className = "status-badge ocupada";
            badge.innerText = "EN USO";
            info.innerHTML = `
                <p class="current-player">👤 ${turnoActivo.clienteNombre}</p>
                <p class="current-time">⏰ Turno ${turnoActivo.hora} hs ${turnoActivo.fijo ? '(Fijo)' : ''}</p>
            `;
        } else {
            badge.className = "status-badge libre";
            badge.innerText = "LIBRE";
            info.innerHTML = `
                <p class="current-player">Sin turno activo</p>
                <p class="current-time">Disponible para alquilar</p>
            `;
        }
    });
}

// -------------------------------------------------------------
// 2. CLIENTES
// -------------------------------------------------------------

function escucharClientes() {
    refClientes.on("value", (snapshot) => {
        clientesData = snapshot.val() || {};
        renderTablaClientes();
        actualizarDatalistClientes();
    });
}

function autoGuardarCliente(nombre, telefono) {
    const existe = Object.values(clientesData).some(c => c.telefono === telefono);
    if (!existe && nombre && telefono) {
        refClientes.push({ nombre, telefono, notas: "Carga rápida turno", fechaRegistro: strFechaHoy() });
    }
}

function guardarCliente(e) {
    e.preventDefault();
    const id = document.getElementById("cliente-id").value;
    const nombre = document.getElementById("nuevo-cliente-nombre").value.trim();
    const telefono = document.getElementById("nuevo-cliente-tel").value.trim();
    const notas = document.getElementById("nuevo-cliente-notas").value.trim();

    if (id) {
        refClientes.child(id).update({ nombre, telefono, notas }, () => {
            mostrarAlertaEstetica("Cliente Actualizado", "Datos guardados correctamente.");
        });
    } else {
        refClientes.push({ nombre, telefono, notas, fechaRegistro: strFechaHoy() }, () => {
            mostrarAlertaEstetica("Cliente Guardado", "Cliente registrado con éxito.");
        });
    }

    document.getElementById("form-cliente").reset();
    document.getElementById("cliente-id").value = "";
}

function renderTablaClientes() {
    const tbody = document.getElementById("tabla-clientes-body");
    const filtro = document.getElementById("search-cliente") ? document.getElementById("search-cliente").value.toLowerCase() : "";
    if (!tbody) return;
    tbody.innerHTML = "";

    const clientesFiltrados = Object.keys(clientesData)
        .map(key => ({ id: key, ...clientesData[key] }))
        .filter(c => c.nombre.toLowerCase().includes(filtro) || c.telefono.includes(filtro));

    if (clientesFiltrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted);">No hay clientes registrados</td></tr>`;
        return;
    }

    clientesFiltrados.forEach(c => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td><strong>${c.nombre}</strong></td>
            <td>📱 ${c.telefono}</td>
            <td><small>${c.notas || '-'}</small></td>
            <td>
                <button onclick="prepararEdicionCliente('${c.id}')" class="btn btn-sm btn-primary">✏️ Editar</button>
                <button onclick="confirmarEliminarCliente('${c.id}')" class="btn btn-sm btn-danger">🗑️ Borrar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function prepararEdicionCliente(id) {
    const c = clientesData[id];
    if (c) {
        document.getElementById("cliente-id").value = id;
        document.getElementById("nuevo-cliente-nombre").value = c.nombre;
        document.getElementById("nuevo-cliente-tel").value = c.telefono;
        document.getElementById("nuevo-cliente-notas").value = c.notas || "";
        switchTab("clientes");
    }
}

function confirmarEliminarCliente(id) {
    mostrarConfirmacionEstetica("⚠️ Eliminar Cliente", "¿Estás seguro de borrar este cliente del directorio?", () => {
        refClientes.child(id).remove();
    });
}

function actualizarDatalistClientes() {
    const datalist = document.getElementById("clientes-list");
    if (!datalist) return;
    datalist.innerHTML = "";
    Object.values(clientesData).forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.nombre;
        datalist.appendChild(opt);
    });
}

// -------------------------------------------------------------
// 3. CAJA CHICA & RETIROS
// -------------------------------------------------------------

function guardarMontoInicialCaja() {
    const monto = parseFloat(document.getElementById("monto-apertura").value) || 0;
    const hoyStr = strFechaHoy();

    refCajaOperaciones.child(hoyStr).update({ montoInicial: monto }, (err) => {
        if (!err) {
            mostrarAlertaEstetica("✅ Caja Inicial", `Monto inicial fijado en $${monto.toLocaleString()}`);
            calcularEstadisticasCaja();
        }
    });
}

function registrarRetiroCaja(e) {
    e.preventDefault();
    const hoyStr = strFechaHoy();
    const concepto = document.getElementById("retiro-concepto").value.trim();
    const monto = parseFloat(document.getElementById("retiro-monto").value) || 0;

    if (monto <= 0) return;

    refCajaOperaciones.child(hoyStr).child("retiros").push({
        concepto, monto,
        hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }, (err) => {
        if (!err) {
            mostrarAlertaEstetica("💸 Retiro Registrado", `Se descontaron **$${monto.toLocaleString()}** de la caja.`);
            document.getElementById("form-retiro-caja").reset();
            calcularEstadisticasCaja();
        }
    });
}

function calcularEstadisticasCaja() {
    const hoyStr = strFechaHoy();
    const mesFiltroInput = document.getElementById("filtro-mes");
    const mesFiltro = mesFiltroInput ? mesFiltroInput.value : hoyStr.substring(0, 7);

    let cajaDia = 0;
    let cajaMes = 0;

    Object.values(turnosData).forEach(t => {
        const montoRecaudado = t.pagado ? Number(t.montoTotal) : Number(t.sena);

        if (t.fecha === hoyStr) {
            cajaDia += montoRecaudado;
        }
        if (t.fecha && t.fecha.startsWith(mesFiltro)) {
            cajaMes += montoRecaudado;
        }
    });

    if (document.getElementById("stat-caja-dia")) {
        document.getElementById("stat-caja-dia").innerText = `$${cajaDia.toLocaleString()}`;
    }

    refCajaOperaciones.child(hoyStr).once("value", (snapshot) => {
        const datosCaja = snapshot.val() || {};
        const montoInicial = Number(datosCaja.montoInicial) || 0;
        
        let totalRetiros = 0;
        if (datosCaja.retiros) {
            Object.values(datosCaja.retiros).forEach(r => totalRetiros += Number(r.monto));
        }

        const efectivoTotal = montoInicial + cajaDia - totalRetiros;

        if (document.getElementById("stat-caja-inicial")) document.getElementById("stat-caja-inicial").innerText = `$${montoInicial.toLocaleString()}`;
        if (document.getElementById("stat-caja-retiros")) document.getElementById("stat-caja-retiros").innerText = `$${totalRetiros.toLocaleString()}`;
        if (document.getElementById("stat-caja-efectivo")) document.getElementById("stat-caja-efectivo").innerText = `$${efectivoTotal.toLocaleString()}`;
    });

    if (document.getElementById("stat-caja-mes")) document.getElementById("stat-caja-mes").innerText = `$${cajaMes.toLocaleString()}`;
}

// -------------------------------------------------------------
// 4. DIÁLOGOS ESTÉTICOS Y ALERTAS
// -------------------------------------------------------------

function mostrarAlertaEstetica(titulo, mensaje) {
    const modalExistente = document.getElementById("custom-modal-alert");
    if (modalExistente) modalExistente.remove();

    const modalHTML = `
        <div id="custom-modal-alert" style="
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.75); display: flex; align-items: center; justify-content: center;
            z-index: 9999; backdrop-filter: blur(4px);
        ">
            <div style="
                background: #151C28; border: 1px solid #1E293B; border-radius: 16px;
                padding: 24px; max-width: 400px; width: 90%; color: #F8FAFC;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center;
            ">
                <h3 style="margin-bottom: 12px; color: #3B82F6; font-size: 1.2rem;">${titulo}</h3>
                <p style="margin-bottom: 20px; font-size: 0.95rem; color: #94A3B8; line-height: 1.4;">${mensaje.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>
                <button onclick="document.getElementById('custom-modal-alert').remove()" style="
                    background: #3B82F6; color: white; border: none; padding: 12px 24px;
                    border-radius: 10px; font-weight: bold; cursor: pointer; width: 100%;
                ">Entendido</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHTML);
}

function mostrarConfirmacionEstetica(titulo, mensaje, callbackAceptar) {
    const modalExistente = document.getElementById("custom-modal-confirm");
    if (modalExistente) modalExistente.remove();

    const modalHTML = `
        <div id="custom-modal-confirm" style="
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.75); display: flex; align-items: center; justify-content: center;
            z-index: 9999; backdrop-filter: blur(4px);
        ">
            <div style="
                background: #151C28; border: 1px solid #1E293B; border-radius: 16px;
                padding: 24px; max-width: 400px; width: 90%; color: #F8FAFC;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center;
            ">
                <h3 style="margin-bottom: 12px; color: #EF4444; font-size: 1.2rem;">${titulo}</h3>
                <p style="margin-bottom: 20px; font-size: 0.95rem; color: #94A3B8; line-height: 1.4;">${mensaje}</p>
                <div style="display: flex; gap: 10px;">
                    <button id="btn-modal-cancel" style="
                        background: #1E293B; color: white; border: none; padding: 12px;
                        border-radius: 10px; font-weight: bold; cursor: pointer; flex: 1;
                    ">Cancelar</button>
                    <button id="btn-modal-accept" style="
                        background: #EF4444; color: white; border: none; padding: 12px;
                        border-radius: 10px; font-weight: bold; cursor: pointer; flex: 1;
                    ">Confirmar</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHTML);

    document.getElementById("btn-modal-cancel").onclick = () => {
        document.getElementById("custom-modal-confirm").remove();
    };

    document.getElementById("btn-modal-accept").onclick = () => {
        document.getElementById("custom-modal-confirm").remove();
        callbackAceptar();
    };
}

function strFechaHoy() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function obtenerDiaSemana(fechaStr) {
    const [year, month, day] = fechaStr.split('-').map(Number);
    return new Date(year, month - 1, day).getDay();
}