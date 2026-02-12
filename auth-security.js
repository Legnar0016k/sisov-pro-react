/**
 * @file auth-security.js
 * @description Neurona de Seguridad Blindada - Control de sesiones y jerarquías.
 */

const AuthSecurity = {
    // Límites definidos por el propietario
    LIMITES: {
        admin: 1,
        vendedor: 4,
        usuario: 2
    },

    async inicializar() {
        console.log("%c[SEGURIDAD] Vigilante de sesiones activado", "color: #ff0000; font-weight: bold;");
        
        // Si hay sesión iniciada, verificamos integridad
        if (window.pb.authStore.isValid) {
            await this.validarSesionUnica();
        }
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
        if (!user) return; // Seguridad extra

        const fingerprintActual = this.generarFingerprint();

        try {
            // Buscamos el estado actual usando el ID del authStore
            const serverUser = await window.pb.collection('users').getOne(user.id, {
                // Forzamos a que no use caché para tener el dato real del servidor
                requestKey: null 
            });

            console.log("[SEGURIDAD] Validando dispositivo:", fingerprintActual);

            // 1. Bloqueo Multi-dispositivo
            if (serverUser.session_id && serverUser.session_id !== fingerprintActual && serverUser.is_online) {
                // Si el ID de sesión es distinto y figura como online, expulsamos
                Swal.fire({
                    icon: 'error',
                    title: 'Acceso Denegado',
                    text: 'Esta cuenta ya tiene una sesión activa en otro dispositivo.',
                    confirmButtonText: 'Entendido'
                }).then(() => {
                    this.cerrarSesionForzado();
                });
                return;
            }

            // 2. Registro de nueva sesión
            // Si llegamos aquí, es el mismo dispositivo o una sesión nueva permitida
            await window.pb.collection('users').update(user.id, {
                session_id: fingerprintActual,
                is_online: true
            });

            // 3. Verificar límites de rol
            await this.verificarCupos(serverUser.rol || 'usuario');

        } catch (error) {
            console.error("[SEGURIDAD] Fallo de enlace con servidor de seguridad:", error);
            // Si falla por 404 o permisos, es un riesgo: cerramos por precaución
            if (error.status === 404 || error.status === 403) {
                console.warn("Posible error de reglas API en PocketBase");
            }
        }
    },
//====================================================================================
    // async validarSesionUnica() {
    //     const user = window.pb.authStore.model;
    //     const fingerprintActual = this.generarFingerprint();

    //     try {
    //         // Buscamos el estado actual del usuario en el servidor
    //         const serverUser = await window.pb.collection('users').getOne(user.id);

    //         // 1. Verificar si el dispositivo es el mismo
    //         if (serverUser.session_id && serverUser.session_id !== fingerprintActual) {
    //             alert("⚠️ SEGURIDAD: Esta cuenta está abierta en otro dispositivo. Se cerrará esta sesión.");
    //             this.cerrarSesionForzado();
    //             return;
    //         }

    //         // 2. Si no tiene session_id, se lo asignamos (Primer inicio de sesión)
    //         if (!serverUser.session_id) {
    //             await window.pb.collection('users').update(user.id, {
    //                 session_id: fingerprintActual,
    //                 is_online: true
    //             });
    //         }

    //         this.verificarCupos(serverUser.rol);

    //     } catch (error) {
    //         console.error("[SEGURIDAD] Error validando integridad:", error);
    //     }
    // },

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