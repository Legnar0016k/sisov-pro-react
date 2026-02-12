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

    // Genera una huella única basada en el navegador y hardware
    generarFingerprint() {
        const userAgent = navigator.userAgent;
        const screenRes = `${screen.width}x${screen.height}`;
        // Una firma simple pero efectiva para empezar
        return btoa(`${userAgent}-${screenRes}`).substring(0, 32);
    },

    async validarSesionUnica() {
        const user = window.pb.authStore.model;
        const fingerprintActual = this.generarFingerprint();

        try {
            // Buscamos el estado actual del usuario en el servidor
            const serverUser = await window.pb.collection('users').getOne(user.id);

            // 1. Verificar si el dispositivo es el mismo
            if (serverUser.session_id && serverUser.session_id !== fingerprintActual) {
                alert("⚠️ SEGURIDAD: Esta cuenta está abierta en otro dispositivo. Se cerrará esta sesión.");
                this.cerrarSesionForzado();
                return;
            }

            // 2. Si no tiene session_id, se lo asignamos (Primer inicio de sesión)
            if (!serverUser.session_id) {
                await window.pb.collection('users').update(user.id, {
                    session_id: fingerprintActual,
                    is_online: true
                });
            }

            this.verificarCupos(serverUser.rol);

        } catch (error) {
            console.error("[SEGURIDAD] Error validando integridad:", error);
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