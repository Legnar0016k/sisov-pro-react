/**
 * @file auth-security.js
 * @description Neurona de Seguridad Blindada - Control de sesiones y jerarquías.
 */

const LimpiezaProfunda = {
    ejecutar() {
        // Limpiamos estados temporales del Sistema pero mantenemos el Auth de PocketBase
        if (window.Sistema) {
            window.Sistema.estado.productos = [];
            window.Sistema.estado.carrito = [];
            window.Sistema.estado.ventas = [];
        }
        console.log("%c[SEGURIDAD] Espacio de trabajo desinfectado y listo.", "color: #fbbf24;");
    }
};

const AuthSecurity = {
    // Límites definidos por el propietario
    LIMITES: {
        admin: 1,
        vendedor: 4,
        usuario: 2
    },

    async inicializar() {
        window.AuthSecurity = this; // Exposición para el core.js
        console.log("%c[SEGURIDAD] Vigilante de acceso sincronizado", "color: #ef4444; font-weight: bold;");
        
        // 1. Si ya hay sesión (F5 o persistencia)
        if (window.pb.authStore.isValid) {
            await this.validarSesionUnica();
        }

        // 2. ESCUCHA REACTIVA: Si el usuario hace login sin refrescar la página
        window.pb.authStore.onChange((token, model) => {
            if (token) {
                console.log("[SEGURIDAD] Nueva sesión detectada, validando...");
                this.validarSesionUnica();
            }
        });
    },
//====================================================================================
    // Genera una huella única basada en el navegador y hardware
    generarFingerprint() {
        const userAgent = navigator.userAgent;
        const screenRes = `${screen.width}x${screen.height}`;
        // Una firma simple pero efectiva para empezar
        return btoa(`${userAgent}-${screenRes}`).substring(0, 32);
    },
//====================================================================================
  async validarSesionUnica() {
        const user = window.pb.authStore.model;
        if (!user) return false;

        const fingerprintActual = this.generarFingerprint();

        try {
            // Forzamos consulta limpia al servidor (sin caché)
            const serverUser = await window.pb.collection('users').getOne(user.id, { $autoCancel: false });

            // A) VALIDACIÓN DE SESIÓN DUPLICADA
            if (serverUser.is_online && serverUser.session_id && serverUser.session_id !== fingerprintActual) {
                await Swal.fire({
                    icon: 'error',
                    title: 'Acceso Restringido',
                    text: 'Esta cuenta ya está activa en otro dispositivo o navegador.',
                    confirmButtonText: 'Cerrar'
                });
                window.pb.authStore.clear(); // Limpiamos rastro
                return false; // REBOTE
            }

            // B) VALIDACIÓN DE CUPOS POR ROL
            const activos = await window.pb.collection('users').getList(1, 1, {
                filter: `user_role = "${serverUser.user_role}" && is_online = true && id != "${user.id}"`
            });

            const limite = this.LIMITES[serverUser.user_role] || 2;
            if (activos.totalItems >= limite) {
                await Swal.fire({
                    icon: 'warning',
                    title: 'Límite Alcanzado',
                    text: `Ya hay ${limite} sesiones de ${serverUser.user_role} activas.`,
                });
                window.pb.authStore.clear();
                return false; // REBOTE
            }

            // C) REGISTRO EXITOSO: El dispositivo toma posesión de la cuenta
            await window.pb.collection('users').update(user.id, {
                session_id: fingerprintActual,
                is_online: true
            });

            console.log("%c[SEGURIDAD] Dispositivo anclado y validado", "color: #10b981;");
            return true; // PASO CONCEDIDO

        } catch (error) {
            console.error("[SEGURIDAD] Error de enlace:", error);
            return true; // Permitimos acceso si hay error de red para no bloquear al dueño
        }
    },

    async verificarCupos(rol) {
        try {
            // Contamos cuántos usuarios de ese rol están online
            const activos = await window.pb.collection('users').getList(1, 10, {
                filter: `rol = "${rol}" && is_online = true`
            });

            if (activos.totalItems > this.LIMITES[rol]) {
                alert(`⚠️ LÍMITE ALCANZADO: Solo se permiten ${this.LIMITES[rol]} sesiones de ${rol}.`);
                this.cerrarSesionForzado();
            }
        } catch (error) {
            console.log("Error consultando cupos");
        }
    },

    cerrarSesionForzado() {
        window.pb.authStore.clear();
        window.location.reload();
    }
};

// Integración inmediata con el ciclo de vida del núcleo
if (window.Sistema) {
    AuthSecurity.inicializar();
}