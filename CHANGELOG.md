[1.0.0] - 2025-10-01
🎉 PRIMER LANZAMIENTO
AÑADIDO
Estructura HTML base del sistema

Integración de TailwindCSS vía CDN

Sistema de iconos Lucide

Vista de login con diseño glass

Vista principal con pestañas (Ventas, Inventario, Reportes, Configuración)

Maquetación de carrito de ventas

Estilos base y animaciones fundamentales

CARACTERÍSTICAS INICIALES
Efecto glass en contenedores

Variables CSS para temas de color

Scroll personalizado con .scroll-thin

Efectos hover en tarjetas

Tipografía del sistema (Inter fallback)

DEPENDENCIAS ORIGINALES
TailwindCSS

Lucide

PocketBase (preparado)
================================================================================
[1.5.0] - 2025-10-20
AÑADIDO
Diseño responsive completo

Media queries para móvil y tablet

Clases utilitarias: .mobile-stack, .mobile-full, .mobile-hide

Grid adaptativo para productos

CAMBIADO
Optimización de CSS con variables CSS personalizadas

Mejora en scroll de carrito
================================================================================
[2.0.0] - 2025-11-15
AÑADIDO
Integración inicial con PocketBase

Sistema de login funcional

Vista de inventario con tabla dinámica

CRUD básico de productos

Cálculo de totales en carrito

TÉCNICO
Configuración de TailwindCSS personalizado

Sistema de colores personalizados (primary, secondary, danger, warning)

Fuente Inter implementada
================================================================================
[2.5.0] - 2025-12-10
AÑADIDO
Sistema de toasts personalizados

Estados de carga con esqueletos (skeleton)

Animaciones de pulso para elementos críticos

CAMBIADO
Mejora en feedback de acciones del usuario

Optimización de mensajes de error
================================================================================
[3.0.0] - 2026-01-02
🎯 HITO: "LITE/BETA ESTABLE"
AÑADIDO
Arquitectura modular con objetos Sistema, Ventas, Inventario, Reportes, Configuracion

Integración completa con PocketBase en Railway

Colecciones: products, sales, users, system_logs

Sistema de autenticación con JWT y persistencia en localStorage

Gestión de tasa BCV con API externa y modo manual

Carrito de compras con cálculo dinámico USD/BS

Procesamiento de ventas con actualización automática de stock

Gráficos de ventas con Chart.js

Exportación a PDF de reportes diarios

MEJORADO
Diseño glassmorphism con backdrop-filter

Sistema de tabs con animaciones fade/slide

Grid responsivo de productos

Badges de estado de stock

Modal para creación/edición de productos
================================================================================

[3.1.0] - 2026-01-15
AÑADIDO
Sistema de gestión de usuarios en pestaña Configuración

Método Configuracion.cargarUsuarios() con consulta a colección users

Badges dinámicos para roles (admin/vendedor/user)

Indicador visual de verificación de cuenta

CAMBIADO
Reestructuración completa de la interfaz de Configuración

Botones de acción primaria para creación de usuarios
================================================================================
[3.2.0] - 2026-01-28
AÑADIDO
Implementación de escáner de códigos QR con html5-qrcode

Métodos iniciarScanner() y detenerScanner() en módulo Ventas

Modal específico para escaneo con lector de cámara

CAMBIADO
Mejora en feedback visual de escaneo

Mensajes toast informativos durante proceso
==================================================================================
[4.0.0] - 2026-02-11 (V.I.E.R.N.E.S. Edition)
🚀 NUEVAS CARACTERÍSTICAS CRÍTICAS
⏱️ Sistema de Fecha Inmutable - "Reloj Venezolano"
Implementación de sincronización forzosa con hora oficial de Venezuela mediante API dedicada

Nuevo endpoint https://web-production-81e05.up.railway.app/hora-venezuela

Campo id_fecha en colección sales para consultas inmutables

Protección contra desfases horarios por configuración local del dispositivo

Eliminación de dependencia de created para reportes diarios

📄 Sistema de Facturación Profesional
Generador de PDF con formato tamaño ticket (80mm × 160mm) - Modo Ahorro de Tinta

Botón especial btn-pdf-notorio con efecto de pulso rojo para descarga inmediata

Diseño minimalista: sin fondos oscuros, líneas decorativas finas, tipografía optimizada

Cabecera corporativa con líneas dobles decorativas

Listado de productos con formato CANT. × DESCRIPCIÓN y TOTAL alineado

Visualización de tasa BCV aplicada en la transacción

Mensajes de pie: "Comprobante de Pago Digital", "No representa factura fiscal"

🔔 Sistema de Atención Visual - "Modo Llamativo"
Nueva clase .tab-atencion con animación pulse-attention

Indicador de punto rojo notificador en pestaña VENTAS (pseudo-elemento ::after)

Efecto de escala 1.05 con sombra pulsante

Fondo azul muy suave (#eef2ff) para diferenciación inmediata

Activación manual mediante Sistema.activarVentasManual()

🛠️ MEJORAS TÉCNICAS PROFUNDAS
🧠 Arquitectura de Persistencia Post-F5
Exposición global temprana de objetos window.Sistema, window.Ventas, window.Inventario, window.Reportes antes de cualquier operación asíncrona

Hidratación automática de tablas al detectar sesión válida en pb.authStore

Carga paralela de inventario y reportes mediante Promise.all

Verificación de salud del servidor con pb.health.check()

Mensajes de depuración con códigos de color ANSI en consola

🔄 Optimización de Peticiones PocketBase
Implementación de requestKey: null en todas las consultas getFullList()

Prevención de cancelación automática de peticiones simultáneas

Instancia única global window.pb para evitar reconexiones innecesarias

Reducción de latencia en consultas de ventas e inventario

📊 Motor de Reportes Mejorado
Destrucción controlada de instancias de Chart.js previas (chartInstancia.destroy())

Prevención de crecimiento infinito del canvas

Opción maintainAspectRatio: false para control dimensional

Formateo de moneda venezolana con Intl.NumberFormat('es-VE')

Desglose por método de pago en PDF de reporte diario

🎨 INTERFAZ DE USUARIO
🧩 Nuevo Componente: Botón Flotante Inteligente
Contenedor #floatingButtons en posición fixed bottom-4 right-4

Botón contextual de creación de usuario (visible solo para rol admin)

Botón de ayuda/chat global

Lógica de visibilidad condicional post-autenticación

🧹 Mensaje de Ayuda Contextual
Banners informativos con opción de cierre manual

Mensaje: "Si no visualizas los productos, presiona cualquier pestaña del menú superior [ejemplo: VENTAS] para refrescar la vista"

Iconografía Lucide integrada

Botón de cierre con evento remove()

📱 Refinamientos Responsive
Ajuste preciso de top en navegación sticky:

Desktop: top-[73px]

Móvil (<640px): top-[110px]

Compensación por header en modo flex-col

🔧 CORRECCIONES CRÍTICAS
🐛 Bugfix: Variable No Definida en Reportes
Problema: Error fechaConsulta is not defined en método cargarDatosVentas()

Solución: Implementación de valor por defecto usando Sistema.estado.config.serverTime

Impacto: Reportes ahora funcionan sin fecha seleccionada

🐛 Bugfix: Acumulación de Gráficos
Problema: Múltiples instancias de Chart.js en cada cambio de pestaña

Solución: Variable de instancia y destrucción controlada

Impacto: Reducción de memoria y mejora en rendimiento visual

🐛 Bugfix: Persistencia de Sesión tras Recarga
Problema: Pérdida de datos en UI al presionar F5

Solución: Sistema de hidratación temprana y carga paralela

Impacto: Experiencia continua sin login repetido

📦 DEPENDENCIAS ACTUALIZADAS
Librería	Versión	Propósito
PocketBase	0.21.1	Backend as a Service
TailwindCSS	latest	Framework CSS
Lucide	latest	Iconografía
jsPDF	2.5.1	Generación de facturas
html5-qrcode	2.3.8	Escáner QR
Chart.js	4.4.0	Visualización de datos
SweetAlert2	11	Diálogos y modales
================================================================================
🚧 PRÓXIMAMENTE (Roadmap 4.1+)
Característica	Estado
Módulo de cuentas por cobrar	Planificado
Backup automático a Google Drive	En desarrollo
Modo oscuro nativo	Planificado
API pública para terceros	En investigación
App híbrida con Capacitor	Planificado
📊 ESTADÍSTICAS DEL PROYECTO
Primer commit: 01/10/2025

Versión actual: 4.0.0

Líneas de código estimadas: ~2,500+

Colecciones PocketBase: 4

Módulos JavaScript: 5 principales

Dependencias CDN: 6 activas

🧠 NOTAS TÉCNICAS PARA DESARROLLADORES
Patrones implementados en v4.0
Singleton Global: Instancia única window.pb

Module Pattern: Objetos Sistema, Ventas, etc.

Observer: Event listeners para cambios en inputs

Factory: crearCardProducto(), crearFilaProducto()

Lazy Loading: Carga diferida de gráficos y reportes

Convenciones de código
Prefijo id_ para campos PocketBase

Sufijo _p para nombres de producto

Métodos asíncronos con async/await

Try/catch en todas las operaciones críticas

© 2024-2026 SISOV PRO - Sistema Inteligente de Operaciones
Documento generado automáticamente mediante análisis de código fuente v4.0
Última actualización: 11 de febrero de 2026
===============================================================================================
## [2026-02-11] - Sincronización de Tiempo Inmutable
### Añadido
- Integración con API propia en Railway para obtención de hora exacta de Venezuela.
- Nueva lógica de respaldo (Fallback) de 3 niveles para la sincronización del servidor.
- Implementación de `id_fecha` en el proceso de ventas para garantizar reportes diarios precisos.

### Corregido
- Error de `ReferenceError: fechaConsulta is not defined` en el módulo de reportes.
- Desfase de fechas en el detalle de ventas (`verDetalleVenta`) mediante el uso de fechas inmutables.
- Problema de cancelación de peticiones en PocketBase usando `requestKey: null`.

## [2026-02-11] - Refactorización Estructural y Reloj Blindado
### Añadido
- Nuevo archivo `core.js` para centralizar toda la lógica del sistema.
- Nuevo archivo `styles.css` para la gestión de estilos personalizados.
- Motor de reloj visual sincronizado con API externa (Railway) con bypass de zona horaria local.

### Cambiado
- `index.html`: Limpieza de scripts internos y vinculación a módulos externos.
- Sistema de tiempo: Ahora ignora la zona horaria del cliente para usar exclusivamente la de Venezuela (UTC-4).

### Optimizado
- Carga inicial: El sistema espera la sincronización de hora antes de procesar ventas o inventario.

## [2026-02-11] - Modularización de UI y Modo de Visualización Detallada
### Añadido
- Nuevo archivo `time-module.js`: Centraliza la lógica de renderizado del reloj y manejo de fechas.
- Modal de "Informe de Tiempo Oficial": Visualización de gran tamaño (Cegato-friendly) sincronizada con la API de Venezuela.
- Efectos visuales interactivos (hover/scale) en el widget del reloj del header.

### Cambiado
- `core.js`: Simplificación del método `iniciarRelojVisual` delegando la actualización de UI al `TimeModule`.
- `index.html`: Integración del nuevo script y actualización de la estructura del header para mejorar la legibilidad de la fecha.

### Corregido
- Jerarquía visual: Se ajustó el tamaño de la fecha en el header a 11px para optimizar la lectura sin romper el layout.