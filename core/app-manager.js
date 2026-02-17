/**
 * @file app-manager.js
 * @description Cerebro central de SISOV PRO. Orquestador de módulos y neuronas.
 */

const AppManager = {
    version: "3.5.0",
    modulosCargados: 0,
    totalModulos: 7, // core, auth-security, time-module, ventas, inventario, reportes, configuracion
    
    // Control del splash screen
    splashScreen: null,
    splashProgress: null,
    splashMessage: null,

   async inicializar() {
    // Inicializar elementos del splash
    this.splashScreen = document.getElementById('splashScreen');
    this.splashProgress = document.getElementById('splashProgress');
    this.splashMessage = document.getElementById('splashMessage');
    
    console.log(`%c[APP-MANAGER] Torre de Control v${this.version} activada`, "color: #00ff00; font-weight: bold;");
    
    try {
        // Cargar lucide primero para que los iconos funcionen
        this.actualizarSplash(5, 'Cargando interfaz...');
        await this.cargarNeurona('https://unpkg.com/lucide@latest');
        
        // Inicializar lucide inmediatamente
        if (window.lucide) {
            lucide.createIcons();
        }
        
        this.actualizarSplash(10, 'Cargando núcleo del sistema...');
            
            // 1. Core principal (siempre primero)
            await this.cargarNeurona('core/core.js');
            this.actualizarSplash(25, 'Núcleo cargado, iniciando seguridad...');
            
            // 2. Módulos de seguridad y utilidades
            await this.cargarNeurona('core/auth-security.js');
            this.actualizarSplash(40, 'Seguridad activada...');
            
            await this.cargarNeurona('core/time-module.js');
            this.actualizarSplash(55, 'Sincronizando tiempo...');
            
            // 3. Módulos de negocio
            await this.cargarNeurona('core/ventas.js');
            this.actualizarSplash(70, 'Preparando módulo de ventas...');
            
            await this.cargarNeurona('core/inventario.js');
            this.actualizarSplash(85, 'Cargando inventario...');
            
            await this.cargarNeurona('core/reportes.js');
            this.actualizarSplash(95, 'Iniciando reportes...');
            
            await this.cargarNeurona('core/configuracion.js');
            
            this.verificarSincronizacion();
            
        } catch (error) {
            console.error("[APP-MANAGER] Fallo crítico en la carga de neuronas:", error);
            this.actualizarSplash(0, 'Error al cargar el sistema');
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
            script.onerror = () => {
                console.error(`Error al cargar la neurona: ${archivo}`);
                this.actualizarSplash(0, `Error cargando módulo`);
                reject(`Error al cargar la neurona: ${archivo}`);
            };
            document.head.appendChild(script);
        });
    },

    actualizarSplash(porcentaje, mensaje) {
        if (this.splashProgress) {
            this.splashProgress.style.width = porcentaje + '%';
        }
        if (this.splashMessage && mensaje) {
            this.splashMessage.textContent = mensaje;
        }
    },

    ocultarSplash() {
        if (this.splashScreen) {
            // Pequeño delay para mostrar el 100%
            this.actualizarSplash(100, '¡Sistema listo!');
            
            setTimeout(() => {
                this.splashScreen.classList.add('hidden');
                // Mostrar login o main según corresponda
                if (window.pb && window.pb.authStore.isValid) {
                    document.getElementById('loginView').classList.add('hidden');
                    document.getElementById('mainView').classList.remove('hidden');
                } else {
                    document.getElementById('loginView').classList.remove('hidden');
                }
            }, 800);
        }
    },

    verificarSincronizacion() {
        if (typeof window.pb !== 'undefined' && typeof window.Sistema !== 'undefined') {
            console.log("%c[SISTEMA] Sincronización completa. Cerebro operativo.", "background: #004400; color: #fff; padding: 2px 5px;");
            
            if (window.pb.authStore.isValid) {
                console.log("[APP-MANAGER] Sesión activa detectada, forzando hidratación...");
                window.Sistema.inicializar().then(() => {
                    this.ocultarSplash();
                });
            } else {
                // No hay sesión, mostrar login
                this.ocultarSplash();
            }
        }
    }
};

document.addEventListener('DOMContentLoaded', () => AppManager.inicializar());