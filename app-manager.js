/**
 * @file app-manager.js
 * @description Cerebro central de SISOV PRO. Orquestador de módulos y neuronas.
 */

const AppManager = {
    version: "3.5.0",
    modulosCargados: 0,
    totalModulos: 1, // Por ahora time-module

    async inicializar() {
        console.log(`%c[APP-MANAGER] Torre de Control v${this.version} activada`, "color: #00ff00; font-weight: bold;");
        // Cargar neuronas base de forma secuencial
        try {
            //modulo de tiempo
            await this.cargarNeurona('time-module.js');
            
            
            this.verificarSincronizacion();
        } catch (error) {
            console.error("[APP-MANAGER] Fallo crítico en la carga de neuronas:", error);
        }
    },

    cargarNeurona(archivo) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = archivo;
            script.onload = () => {
                console.log(`%c[NEURONA] ${archivo} integrada correctamente`, "color: #00d4ff;");
                this.modulosCargados++;
                resolve();
            };
            script.onerror = () => reject(`Error al cargar la neurona: ${archivo}`);
            document.head.appendChild(script);
        });
    },

    verificarSincronizacion() {
        // Verifica que PocketBase y el Sistema existan
        if (typeof window.pb !== 'undefined' && typeof window.Sistema !== 'undefined') {
            console.log("%c[SISTEMA] Sincronización completa. Cerebro operativo.", "background: #004400; color: #fff; padding: 2px 5px;");
            
            // DISPARADOR MANUAL: Si el usuario ya estaba logueado, forzamos el arranque
            if (window.pb.authStore.isValid) {
                console.log("[APP-MANAGER] Sesión activa detectada, forzando hidratación...");
                window.Sistema.inicializar();
            }
        }
    }
};

// Iniciar la torre de control cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => AppManager.inicializar());