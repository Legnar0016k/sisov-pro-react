/**
 * @file app-manager.js
 * @description Cerebro central de SISOV PRO - VERSIÓN REFACTORIZADA
 * @version 4.0.0
 * @author Equipo de Desarrollo SISOV PRO
 * // ======================================================
// AVISO DE PROPIEDAD INTELECTUAL
// ======================================================
// SISOV PRO v4.0 y versiones posteriores es software comercial propietario.
// Copyright © 2026 SISOV PRO. Todos los derechos reservados.
// 
// Este software está protegido por leyes de propiedad intelectual.
// Su uso no autorizado, distribución o modificación constituye
// una violación de estos derechos y será perseguido legalmente.
//
// Para obtener una licencia comercial, contacte a:
// [TU legnar0016k.dev@gmail.com] - [TU SITIO WEB]
// ======================================================
// Versiones anteriores (v3.0 y anteriores) están bajo licencia MIT.
// La versión 4.0 y posteriores NO es software libre.
// ======================================================
 */

const AppManager = {
    version: "3.5.1",
    dependencias: {
        core: false,
        auth: false,
        time: false,
        ventas: false,
        inventario: false,
        reportes: false,
        config: false
    },
    
    async inicializar() {
        console.log(`%c[APP-MANAGER] Iniciando v${this.version}...`, "color: #00ff00; font-weight: bold;");
        
        try {
            // 1. Verificar PocketBase primero (CDN ya cargado)
            if (typeof PocketBase === 'undefined') {
                throw new Error("PocketBase no está disponible");
            }
            
            // 2. Inicializar PocketBase con configuración mejorada
            window.pb = new PocketBase('https://sisov-pro-react-production.up.railway.app');
            window.pb.beforeSend = (url, options) => {
                options.mode = 'cors';
                options.headers = {
                    ...options.headers,
                    'X-Request-ID': `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                };
                return { url, options };
            };
            
            // 3. Cargar núcleo primero (Sistema base)
            await this.cargarScriptConRetry('core/core.js', 'core');
            
            // 4. Esperar a que Sistema esté disponible
            await this.esperarSistema();
            
            // 5. Cargar módulos de seguridad
            await this.cargarScriptConRetry('core/auth-security.js', 'auth');
            
            // 6. Cargar módulos auxiliares
            await this.cargarScriptConRetry('core/time-module.js', 'time');
            
            // 7. Cargar módulos de negocio (orden específico)
            await this.cargarScriptConRetry('core/inventario.js', 'inventario');
            await this.cargarScriptConRetry('core/ventas.js', 'ventas');
            await this.cargarScriptConRetry('core/reportes.js', 'reportes');
            await this.cargarScriptConRetry('core/configuracion.js', 'config');
            
            // 8. Verificar que todo se cargó
            this.verificarDependencias();
            
            // 9. Inicializar lucide
            if (window.lucide) {
                lucide.createIcons();
            }
            
            // 10. Inicializar sistema con timeout
            await Promise.race([
                window.Sistema.inicializar(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Timeout inicializando Sistema")), 10000)
                )
            ]);
            
            // 11. Ocultar splash con animación suave
            this.ocultarSplash();
            
            console.log("%c[APP-MANAGER] Sistema listo y operativo", "color: #10b981; font-weight: bold;");
            
        } catch (error) {
            console.error("[APP-MANAGER] Error fatal:", error);
            this.mostrarErrorFatal(error.message);
        }
    },

    cargarScriptConRetry(src, modulo, intentos = 3) {
        return new Promise((resolve, reject) => {
            let intentosRealizados = 0;
            
            const intentarCarga = () => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => {
                    this.dependencias[modulo] = true;
                    console.log(`%c[APP-MANAGER] Módulo cargado: ${modulo}`, "color: #60a5fa;");
                    resolve();
                };
                script.onerror = () => {
                    intentosRealizados++;
                    if (intentosRealizados < intentos) {
                        console.warn(`[APP-MANAGER] Reintentando ${modulo} (${intentosRealizados}/${intentos})`);
                        setTimeout(intentarCarga, 1000 * intentosRealizados);
                    } else {
                        reject(new Error(`No se pudo cargar ${modulo} después de ${intentos} intentos`));
                    }
                };
                document.head.appendChild(script);
            };
            
            intentarCarga();
        });
    },

    esperarSistema() {
        return new Promise((resolve, reject) => {
            let tiempo = 0;
            const intervalo = setInterval(() => {
                if (window.Sistema && typeof window.Sistema.inicializar === 'function') {
                    clearInterval(intervalo);
                    resolve();
                }
                tiempo += 100;
                if (tiempo > 5000) {
                    clearInterval(intervalo);
                    reject(new Error("Timeout esperando Sistema"));
                }
            }, 100);
        });
    },

    verificarDependencias() {
        const pendientes = Object.entries(this.dependencias)
            .filter(([_, cargada]) => !cargada)
            .map(([modulo]) => modulo);
            
        if (pendientes.length > 0) {
            console.warn(`[APP-MANAGER] Módulos no confirmados: ${pendientes.join(', ')}`);
        }
    },

    ocultarSplash() {
        const splash = document.getElementById('splashScreen');
        if (splash) {
            splash.style.opacity = '0';
            setTimeout(() => {
                splash.classList.add('hidden');
                splash.style.opacity = '1';
            }, 500);
        }
    },

    mostrarErrorFatal(mensaje) {
        const splash = document.getElementById('splashScreen');
        if (splash) {
            splash.innerHTML = `
                <div class="text-center p-8 bg-red-600 rounded-2xl">
                    <i data-lucide="alert-triangle" class="w-16 h-16 text-white mx-auto mb-4"></i>
                    <h2 class="text-2xl font-bold text-white mb-2">Error de Inicialización</h2>
                    <p class="text-white/90 mb-4">${mensaje}</p>
                    <button onclick="location.reload()" 
                            class="bg-white text-red-600 px-6 py-3 rounded-xl font-bold hover:bg-red-50 transition-colors">
                        Reintentar
                    </button>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    }
};

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AppManager.inicializar());
} else {
    AppManager.inicializar();
}