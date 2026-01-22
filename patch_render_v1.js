/**
 * ARCHIVO: patch_render_v1.js
 * DESCRIPCIÓN: Parche de Persistencia y Auto-Renderizado V17
 * ID: PATCH-PERSISTENCE-V17
 */

(function() {
    console.log("%c[PATCH] Activando Protocolo de Persistencia V17...", "color: #8b5cf6; font-weight: bold;");

    const inicializarSistema = async () => {
        try {
            // 1. Asegurar que pb exista y tenga la URL correcta
            if (typeof window.pb === 'undefined') {
                window.pb = new PocketBase('https://sisov-pro-react-production.up.railway.app');
            }

            // 2. RECUPERAR SESIÓN: Forzamos a pb a mirar el localStorage
            // Esto evita que al recargar aparezca como "no logueado"
            const authData = localStorage.getItem('pocketbase_auth');
            if (authData && !window.pb.authStore.isValid) {
                window.pb.authStore.loadFromCookie(authData); 
                console.log("%c[PATCH] Sesión recuperada del almacenamiento local", "color: #3b82f6;");
            }

            // 3. VERIFICAR NÚCLEO: ¿Está listo el objeto Inventario?
            if (window.Inventario && typeof window.Inventario.cargarProductos === 'function') {
                
                // Si la sesión es válida, disparamos la carga
                if (window.pb.authStore.isValid) {
                    console.log("%c[PATCH] Sesión validada. Forzando renderizado persistente...", "color: #10b981;");
                    
                    // Asegurar tasa de cambio antes de mostrar productos
                    if (window.Sistema && typeof window.Sistema.obtenerTasaBCV === 'function') {
                        await window.Sistema.obtenerTasaBCV();
                    }

                    // EJECUCIÓN MAESTRA
                    await window.Inventario.cargarProductos();
                    
                    console.log("%c[SUCCESS] Renderizado completado tras recarga.", "color: #10b981; font-weight: bold;");
                    
                    // Detener el vigilante solo si tuvo éxito
                    clearInterval(vigilantePersistente);
                } else {
                    console.warn("[PATCH] Esperando inicio de sesión activo...");
                }
            }
        } catch (err) {
            console.error("[PATCH ERROR]", err);
        }
    };

    // Revisar cada 1 segundo (balance entre velocidad y consumo)
    const vigilantePersistente = setInterval(inicializarSistema, 1000);
    
    // Ejecución inmediata al cargar el archivo
    inicializarSistema();
})();