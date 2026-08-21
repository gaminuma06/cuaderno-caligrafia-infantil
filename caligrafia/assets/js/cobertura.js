/**
 * Configuración de cobertura de envíos.
 *
 * covered:false = el departamento aparece deshabilitado en el formulario
 * y bloquea el envío del pedido con un mensaje al usuario.
 *
 * Por defecto solo bloqueamos San Andrés y Providencia (zona insular,
 * ninguna transportadora terrestre nacional -Interrápidisimo, Coordinadora,
 * Envía, Veloces, Domina, 99minutos- entrega ahí con recaudo contraentrega).
 *
 * AJUSTA ESTA LISTA según la cobertura real que confirmes en Dropi para
 * cada transportadora. Cambiar un departamento a covered:false es lo único
 * que necesitas tocar para bloquearlo en el formulario.
 */
const COBERTURA_DEPARTAMENTOS = [
  { nombre: "Amazonas", covered: true },
  { nombre: "Antioquia", covered: true },
  { nombre: "Arauca", covered: true },
  { nombre: "Atlántico", covered: true },
  { nombre: "Bogotá D.C.", covered: true },
  { nombre: "Bolívar", covered: true },
  { nombre: "Boyacá", covered: true },
  { nombre: "Caldas", covered: true },
  { nombre: "Caquetá", covered: true },
  { nombre: "Casanare", covered: true },
  { nombre: "Cauca", covered: true },
  { nombre: "Cesar", covered: true },
  { nombre: "Chocó", covered: true },
  { nombre: "Córdoba", covered: true },
  { nombre: "Cundinamarca", covered: true },
  { nombre: "Guainía", covered: true },
  { nombre: "Guaviare", covered: true },
  { nombre: "Huila", covered: true },
  { nombre: "La Guajira", covered: true },
  { nombre: "Magdalena", covered: true },
  { nombre: "Meta", covered: true },
  { nombre: "Nariño", covered: true },
  { nombre: "Norte de Santander", covered: true },
  { nombre: "Putumayo", covered: true },
  { nombre: "Quindío", covered: true },
  { nombre: "Risaralda", covered: true },
  { nombre: "San Andrés y Providencia", covered: false },
  { nombre: "Santander", covered: true },
  { nombre: "Sucre", covered: true },
  { nombre: "Tolima", covered: true },
  { nombre: "Valle del Cauca", covered: true },
  { nombre: "Vaupés", covered: true },
  { nombre: "Vichada", covered: true },
];
