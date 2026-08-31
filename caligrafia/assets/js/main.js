/**
 * CONFIGURACIÓN — edita estos dos valores antes de publicar
 * -----------------------------------------------------------------------
 * 1) APPS_SCRIPT_URL: la URL de despliegue de tu Google Apps Script
 *    (ver /apps-script/Code.gs y las instrucciones en README.md).
 * 2) WHATSAPP_NUMERO: tu número de WhatsApp de ventas con indicativo de
 *    país, solo dígitos (ej: 573001234567), para el botón de contacto.
 */
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx7E_hyg8wKg-T_pfbInvZNEOP2ZeBjMdckaTXw39oBO_SIGa1VB2J-GjBAou5hR6wLWw/exec";
const WHATSAPP_NUMERO = "573012251358";

// Precios ya incluyen el envío (no se cobra nada aparte al recibir).
const BUNDLES = {
  "1": { unidades: 1, total: 45900, etiqueta: "1 Kit" },
  "2": { unidades: 2, total: 79900, etiqueta: "2 Kits" },
  "3": { unidades: 3, total: 100800, etiqueta: "3 Kits" },
};

const PAGE_LOADED_AT = Date.now();

const money = (n) =>
  "$" + n.toLocaleString("es-CO", { maximumFractionDigits: 0 });

/* ---------- Meta (Facebook) Pixel: eventos personalizados ----------
 * fbq() siempre existe una vez cargado el snippet del <head> (aunque el
 * ID todavía sea el de PENDIENTE), así que estas llamadas nunca truenan;
 * simplemente no hacen nada hasta que se configure el ID real. */
function trackFbEvent(nombre, datos) {
  if (typeof fbq === "function") fbq("track", nombre, datos);
}

document.addEventListener("DOMContentLoaded", () => {
  initBundleSelector();
  initCoberturaSelect();
  initSmoothScrollCTAs();
  initForm();
  initWhatsappLinks();
});

/* ---------- Selector de bundle (1 / 2 / 3 kits) ---------- */
function initBundleSelector() {
  const radios = document.querySelectorAll('input[name="bundle"]');
  const resumenTotal = document.querySelectorAll("[data-resumen-total]");
  const resumenEtiqueta = document.querySelectorAll("[data-resumen-etiqueta]");

  function actualizar() {
    const seleccionado = document.querySelector('input[name="bundle"]:checked');
    if (!seleccionado) return;
    const bundle = BUNDLES[seleccionado.value];
    resumenTotal.forEach((el) => (el.textContent = money(bundle.total)));
    resumenEtiqueta.forEach((el) => (el.textContent = bundle.etiqueta));
  }

  radios.forEach((r) => r.addEventListener("change", actualizar));
  actualizar();
}

/* ---------- Poblar el <select> de departamentos con bloqueo de cobertura ---------- */
function initCoberturaSelect() {
  const select = document.getElementById("departamento");
  if (!select) return;

  select.innerHTML = '<option value="" disabled selected>Selecciona tu departamento</option>';

  COBERTURA_DEPARTAMENTOS.forEach(({ nombre, covered }) => {
    const opt = document.createElement("option");
    opt.value = nombre;
    opt.textContent = covered ? nombre : `${nombre} (sin cobertura por ahora)`;
    opt.disabled = !covered;
    select.appendChild(opt);
  });

  select.addEventListener("change", () => {
    const aviso = document.getElementById("cobertura-aviso");
    const encontrado = COBERTURA_DEPARTAMENTOS.find((d) => d.nombre === select.value);
    if (aviso) {
      aviso.hidden = !encontrado || encontrado.covered;
    }
    actualizarCiudades(select.value);
  });
}

/* ---------- Poblar el <select> de ciudad/municipio según el departamento ----------
 * Evita que el cliente escriba a mano una ciudad inventada o con errores: solo
 * puede elegir un municipio real de la lista (ver assets/js/municipios.js). */
function actualizarCiudades(nombreDepartamento) {
  const select = document.getElementById("ciudad");
  if (!select) return;

  const municipios = (typeof MUNICIPIOS_POR_DEPARTAMENTO !== "undefined" && nombreDepartamento)
    ? MUNICIPIOS_POR_DEPARTAMENTO[nombreDepartamento]
    : null;

  if (!municipios || municipios.length === 0) {
    select.innerHTML = '<option value="" selected>Primero elige tu departamento</option>';
    select.disabled = true;
    return;
  }

  select.innerHTML = '<option value="" disabled selected>Selecciona tu ciudad o municipio</option>'
    + municipios.map((c) => `<option value="${c}">${c}</option>`).join("");
  select.disabled = false;
}

/* ---------- Scroll suave desde los botones "Comprar ahora" hacia el formulario ---------- */
function initSmoothScrollCTAs() {
  document.querySelectorAll('[data-cta="comprar"]').forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById("pedido").scrollIntoView({ behavior: "smooth", block: "start" });
      const primerCampo = document.getElementById("nombres");
      if (primerCampo) setTimeout(() => primerCampo.focus(), 400);

      const bundleInput = document.querySelector('input[name="bundle"]:checked');
      const bundle = BUNDLES[bundleInput ? bundleInput.value : "1"];
      trackFbEvent("InitiateCheckout", {
        content_name: "Kit Cuadernos Mágicos Montessori de Caligrafía",
        content_ids: ["861688"],
        content_type: "product",
        currency: "COP",
        value: bundle.total,
        num_items: bundle.unidades,
      });
    });
  });
}

/* ---------- Envío del formulario de pedido ---------- */
function initForm() {
  const form = document.getElementById("form-pedido");
  if (!form) return;

  const telefonoRegex = /^3\d{9}$/;
  const cedulaRegex = /^\d{6,10}$/;
  const correoRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nombres = form.nombres.value.trim();
    const apellidos = form.apellidos.value.trim();
    const cedula = form.cedula.value.trim();
    const telefono = form.telefono.value.trim();
    const correo = form.correo.value.trim();
    const departamento = form.departamento.value;
    const ciudad = form.ciudad.value.trim();
    const direccion = form.direccion.value.trim();
    const bundleInput = document.querySelector('input[name="bundle"]:checked');
    const bundle = bundleInput ? bundleInput.value : "1";

    const errores = [];
    if (nombres.length < 2) errores.push("Ingresa tu nombre completo.");
    if (apellidos.length < 2) errores.push("Ingresa tus apellidos.");
    if (!cedulaRegex.test(cedula)) errores.push("Ingresa un número de cédula válido (6 a 10 dígitos).");
    if (!telefonoRegex.test(telefono)) errores.push("Ingresa un celular colombiano válido (10 dígitos, empieza en 3).");
    if (!correoRegex.test(correo)) errores.push("Ingresa un correo electrónico válido.");
    if (!departamento) errores.push("Selecciona tu departamento.");
    if (ciudad.length < 2) errores.push("Ingresa tu ciudad o municipio.");
    if (direccion.length < 5) errores.push("Ingresa una dirección completa.");

    const coberturaDept = COBERTURA_DEPARTAMENTOS.find((d) => d.nombre === departamento);
    if (coberturaDept && !coberturaDept.covered) {
      errores.push(`Por ahora no realizamos envíos a ${departamento}.`);
    }

    const errorBox = document.getElementById("form-errores");
    if (errores.length) {
      errorBox.hidden = false;
      errorBox.innerHTML = errores.map((e) => `<li>${e}</li>`).join("");
      errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    errorBox.hidden = true;

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Enviando...";

    const payload = {
      fecha: new Date().toISOString(),
      nombres,
      apellidos,
      cedula,
      telefono,
      correo,
      departamento,
      ciudad,
      direccion,
      notas: form.notas.value.trim(),
      bundle: BUNDLES[bundle].etiqueta,
      unidades: BUNDLES[bundle].unidades,
      total: BUNDLES[bundle].total,
      producto: "Kit Cuadernos Mágicos Montessori de Caligrafía",
      origen: location.href,
      // Señales anti-spam: el servidor (Code.gs) decide qué hacer con esto,
      // no lo bloqueamos aquí porque un bot que llama directo a la URL del
      // Apps Script se saltaría cualquier validación hecha solo en el navegador.
      sitio_web: form.sitio_web.value.trim(),
      segundos_en_pagina: Math.round((Date.now() - PAGE_LOADED_AT) / 1000),
    };

    try {
      if (APPS_SCRIPT_URL.startsWith("http")) {
        await fetch(APPS_SCRIPT_URL, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload),
        });
      } else {
        console.warn("APPS_SCRIPT_URL no está configurada todavía. Pedido no guardado:", payload);
      }
      trackFbEvent("Lead", {
        content_name: payload.producto,
        content_ids: ["861688"],
        content_type: "product",
        currency: "COP",
        value: payload.total,
        num_items: payload.unidades,
      });
      mostrarConfirmacion(payload);
      form.reset();
      initBundleSelector();
    } catch (err) {
      errorBox.hidden = false;
      errorBox.innerHTML = "<li>No pudimos enviar tu pedido. Intenta de nuevo o escríbenos por WhatsApp.</li>";
      console.error(err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Confirmar pedido";
    }
  });
}

function mostrarConfirmacion(payload) {
  const form = document.getElementById("form-pedido");
  const confirmacion = document.getElementById("pedido-confirmado");
  form.hidden = true;
  confirmacion.hidden = false;
  confirmacion.querySelector("[data-confirmado-resumen]").textContent =
    `${payload.bundle} — ${money(payload.total)} · Te contactaremos al ${payload.telefono} para confirmar la entrega.`;
  confirmacion.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ---------- Enlaces de WhatsApp ---------- */
function initWhatsappLinks() {
  const links = document.querySelectorAll("[data-whatsapp]");
  const mensaje = encodeURIComponent(
    "¡Hola! Quiero más información del Kit Cuadernos Mágicos Montessori de Caligrafía 📓✨"
  );
  links.forEach((a) => {
    if (WHATSAPP_NUMERO.startsWith("57") && /^\d+$/.test(WHATSAPP_NUMERO)) {
      a.href = `https://wa.me/${WHATSAPP_NUMERO}?text=${mensaje}`;
    } else {
      a.href = "#pedido";
    }
  });
}
