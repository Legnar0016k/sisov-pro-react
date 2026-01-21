/**
 * ARCHIVO: patch_render_v1.js
 * DESCRIPCIÓN: Parche de Estabilización Silenciosa V16
 * ID: PATCH-SILENT-V16
 */

(function() {
    console.log("%c[PATCH] Ejecutando Protocolo de Estabilización V16...", "color: #8b5cf6; font-weight: bold;");

    const estabilizarNucleo = async () => {
        try {
            // 1. Asegurar instancia de PocketBase
            if (typeof window.pb === 'undefined') {
                window.pb = new PocketBase('https://sisov-pro-react-production.up.railway.app');
            }

            // 2. Verificar si el Inventario está listo para trabajar
            if (window.Inventario && typeof window.Inventario.cargarProductos === 'function') {
                console.log("%c[PATCH] Núcleo listo. Iniciando renderizado...", "color: #10b981;");

                // Intentar obtener tasa, pero si falla no detener el proceso
                try {
                    if (window.Sistema && typeof window.Sistema.obtenerTasaBCV === 'function') {
                        await window.Sistema.obtenerTasaBCV();
                    }
                } catch (e) { 
                    console.warn("[PATCH] Tasa BCV no disponible aún, usando valores por defecto.");
                }

                // Renderizar productos
                await window.Inventario.cargarProductos();
                
                console.log("%c[SUCCESS] Sistema estabilizado y productos cargados.", "color: #10b981; font-weight: bold;");
                clearInterval(vigilante); // Detener el parche porque ya cumplió su misión
            }
        } catch (err) {
            // No mostramos error repetitivo para no saturar la consola
        }
    };

    // Revisar el sistema cada 1.5 segundos para no saturar
    const vigilante = setInterval(estabilizarNucleo, 1500);
})();