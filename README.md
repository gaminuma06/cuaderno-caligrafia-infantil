# Caligrafía Infantil — Landing Kit Cuadernos Montessori

Landing de una sola página (single page, sin menú de navegación) para tráfico pago
de Facebook/TikTok Ads, hecha en HTML + CSS + JS puro. Publicada en:
`tienda.adanarias.com/caligrafia`

## Estructura

```
caligrafia/
  index.html               # toda la landing (una sola página)
  assets/css/styles.css
  assets/js/main.js        # config, bundles, validación, envío del pedido
  assets/js/cobertura.js   # departamentos con envío habilitado/bloqueado
apps-script/
  Code.gs                  # backend gratuito: guarda cada pedido en Google Sheets
```

## Pasos pendientes antes de publicar (en orden)

### 1. Crear el Google Sheet + Apps Script (guarda los pedidos)
Sigue las instrucciones dentro de [`apps-script/Code.gs`](apps-script/Code.gs):
crear la hoja "Pedidos", pegar el script, implementar como aplicación web, copiar
la URL. Cada pedido nuevo caerá como fila en el Sheet con: fecha, nombre, teléfono,
dirección, ciudad, bundle y total — listo para que copies esos datos al formulario
"Crear Orden" de Dropi manualmente.

### 2. Configurar `caligrafia/assets/js/main.js`
```js
const APPS_SCRIPT_URL = "..."; // pega aquí la URL del paso 1
const WHATSAPP_NUMERO = "573XXXXXXXXX"; // tu número de ventas, solo dígitos
```
Mientras `APPS_SCRIPT_URL` no empiece por `http`, el formulario no envía datos a
ningún lado (los pedidos solo aparecen en la consola del navegador) — así puedes
probar sin ensuciar el Sheet.

### 3. Publicar en `tienda.adanarias.com/caligrafia`
El subdominio `tienda.adanarias.com` necesita apuntar a un hosting (donde vive
`adanarias.com` hoy, o uno nuevo tipo Netlify/Cloudflare Pages/GitHub Pages) con
un registro DNS tipo A/CNAME. Una vez tengas el hosting elegido, solo hay que
subir la carpeta `caligrafia/` completa a la raíz de ese subdominio (para que la
URL final sea `tienda.adanarias.com/caligrafia/`). Dime qué proveedor DNS/hosting
usas para `adanarias.com` y te doy los pasos exactos.

### 4. Ajustar cobertura de envíos
Edita [`caligrafia/assets/js/cobertura.js`](caligrafia/assets/js/cobertura.js).
Por defecto solo está bloqueado San Andrés y Providencia (zona insular). Cambia
`covered: false` en cualquier departamento que confirmes que tus transportadoras
en Dropi (Interrápidisimo, Coordinadora, Envía, Veloces, Domina, 99minutos) no
cubren con recaudo contraentrega — el formulario lo bloqueará automáticamente
con un aviso al comprador.

### 5. Reemplazar imágenes por fotos reales
El hero usa una ilustración SVG hecha a medida (sin dependencias externas, carga
instantánea) como placeholder. Cuando tengas las fotos reales del producto desde
Dropi (clic derecho > Copiar dirección de imagen en la ficha del producto), dímelo
y las integro comprimidas/optimizadas y con lazy-load.

### 6. Activar reseñas reales
La sección de prueba social (`index.html`, bloque comentado `<!-- reviews-grid -->`)
está intencionalmente vacía: no se publicaron testimonios inventados porque usar
reseñas falsas con nombre/foto viola las políticas de anuncios de Meta/TikTok y
las normas de publicidad engañosa en Colombia. Apenas tengas 2-3 reseñas reales
(captura de WhatsApp, foto, calificación), las agrego.

## Checklist rápido de lo ya construido
- [x] Sin header con menú / sin links de salida del flujo de compra
- [x] Mobile-first, CTA "Comprar ahora" visible sin scroll (above the fold)
- [x] CTA repetido 4 veces (hero, precio, mitad, final) + barra fija inferior
- [x] Selector de bundle progresivo (1 / 2 / 3 kits)
- [x] Formulario de pedido con validación y bloqueo por departamento sin cobertura
- [x] Guardado de pedidos en Google Sheets vía Apps Script (gratis, sin servidor)
- [ ] URL de Apps Script configurada (paso 1-2)
- [ ] Número de WhatsApp configurado (paso 2)
- [ ] Publicado en tienda.adanarias.com/caligrafia (paso 3)
- [ ] Fotos reales del producto (paso 5)
- [ ] Reseñas reales (paso 6)

## Probar en local
Abre `caligrafia/index.html` con un servidor local simple (doble clic funciona,
pero para que el `fetch` a Apps Script no falle por CORS del navegador al abrir
como `file://`, mejor usa un servidor):
```
cd caligrafia
python -m http.server 8080
# abre http://localhost:8080
```
