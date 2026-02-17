/**
 * @file auth-security.js
 * @description Seguridad mejorada con validación cliente-servidor, reconexión automática y timeout por inactividad
 */

// ======================================================
// CONFIGURACIÓN DE SEGURIDAD
// ======================================================

const SEGURIDAD_CONFIG = {
    // Timeout por inactividad (30 minutos = 1800000 ms)
    INACTIVITY_TIMEOUT: 30 * 60 * 1000,
    
    // Intervalo de verificación de inactividad (1 minuto)
    INACTIVITY_CHECK_INTERVAL: 60 * 1000,
    
    // Intervalo de heartbeat (1 minuto)
    HEARTBEAT_INTERVAL: 60 * 1000,
    
    // Intentos de reconexión
    RECONEXION_INTENTOS: 5,
    
    // Intervalo entre reintentos de reconexión (creciente)
    RECONEXION_BASE_DELAY: 2000,
    
    // Tiempo para considerar una sesión huérfana (5 minutos sin last_seen)
    SESSION_ORPHAN_TIMEOUT: 5 * 60 * 1000
};

// ======================================================
// GESTIÓN DE LICENCIAS
// ======================================================

const GestionLicencias = {
    licenciaActual: null,
    _cargandoLicencia: false,
    _ultimaVerificacion: null,
    _intervaloVerificacion: null,
    
    async inicializar() {
        console.log("[LICENCIAS] Inicializando...");
        
        // Escuchar cambios en autenticación
        window.pb.authStore.onChange(async (token, model) => {
            if (token) {
                setTimeout(() => this.cargarLicenciaUsuario(), 100);
            } else {
                this.licenciaActual = null;
                this.actualizarUILicencia('no_licencia', null);
                this.detenerVerificacionPeriodica();
            }
        });
        
        // Iniciar verificación periódica
        this.iniciarVerificacionPeriodica();
        
        console.log("[LICENCIAS] Listo");
    },
    
    iniciarVerificacionPeriodica() {
        if (this._intervaloVerificacion) {
            clearInterval(this._intervaloVerificacion);
        }
        
        this._intervaloVerificacion = setInterval(() => {
            this.verificarEstadoLicencia().catch(e => 
                console.warn("[LICENCIAS] Error en verificación periódica:", e)
            );
        }, 300000); // Cada 5 minutos
    },
    
    detenerVerificacionPeriodica() {
        if (this._intervaloVerificacion) {
            clearInterval(this._intervaloVerificacion);
            this._intervaloVerificacion = null;
        }
    },
    
    async cargarLicenciaUsuario(forzar = false) {
        if (this._cargandoLicencia && !forzar) {
            console.log("[LICENCIAS] Cargando licencia...");
            return this.licenciaActual;
        }
        
        // Cache de 1 minuto
        if (!forzar && this._ultimaVerificacion && (Date.now() - this._ultimaVerificacion) < 60000) {
            console.log("[LICENCIAS] Usando cache");
            return this.licenciaActual;
        }
        
        this._cargandoLicencia = true;
        
        try {
            const user = window.pb.authStore.model;
            if (!user?.id) {
                console.log("[LICENCIAS] No hay usuario autenticado");
                return null;
            }
            
            console.log("[LICENCIAS] Buscando licencia para:", user.id);
            
            // Buscar licencia activa del usuario
            const licencias = await window.pb.collection('licencias').getFullList({
                filter: `user_id = "${user.id}" && active = true`,
                requestKey: `licencia_${Date.now()}`,
                $autoCancel: false
            }).catch(error => {
                if (error.status === 0) {
                    // Error de red, usar cache si existe
                    console.warn("[LICENCIAS] Error de red, usando cache");
                    return this.licenciaActual ? [this.licenciaActual] : [];
                }
                throw error;
            });
            
            if (licencias && licencias.length > 0) {
                this.licenciaActual = licencias[0];
                console.log("[LICENCIAS] Licencia encontrada:", this.licenciaActual.key);
                
                await this.verificarEstadoLicencia();
                
                this._ultimaVerificacion = Date.now();
                return this.licenciaActual;
            } else {
                console.log("[LICENCIAS] No hay licencia asignada");
                this.licenciaActual = null;
                this.actualizarUILicencia('sin_licencia', null);
            }
            
            return null;
            
        } catch (error) {
            console.error("[LICENCIAS] Error:", error);
            window.Sistema?.manejarError('cargar_licencia', error, false);
            return null;
        } finally {
            this._cargandoLicencia = false;
        }
    },
    
    async verificarEstadoLicencia() {
        if (!this.licenciaActual) return false;
        
        try {
            // Verificar en servidor (no confiar en fecha local)
            const licenciaServer = await window.pb.collection('licencias').getOne(
                this.licenciaActual.id,
                { requestKey: `verificar_${Date.now()}`, $autoCancel: false }
            ).catch(error => {
                if (error.status === 0) {
                    // Error de red, mantener estado actual
                    console.warn("[LICENCIAS] Error de red en verificación");
                    return this.licenciaActual;
                }
                throw error;
            });
            
            // Actualizar datos locales
            this.licenciaActual = licenciaServer;
            
            // Verificar expiración (usando fecha del servidor)
            const hoy = new Date();
            const fechaExpiracion = licenciaServer.expired ? new Date(licenciaServer.expired) : null;
            
            let expirada = false;
            if (fechaExpiracion && fechaExpiracion < hoy) {
                expirada = true;
                
                // Desactivar licencia en servidor si expiró
                if (licenciaServer.estado === 'activa') {
                    await window.pb.collection('licencias').update(licenciaServer.id, {
                        estado: 'suspendida',
                        active: false
                    }).catch(e => console.warn("[LICENCIAS] Error actualizando licencia:", e));
                    licenciaServer.estado = 'suspendida';
                }
            }
            
            const estado = expirada ? 'suspendida' : (licenciaServer.estado || 'activa');
            
            // Actualizar UI
            this.actualizarUILicencia(estado, fechaExpiracion);
            
            return estado === 'activa';
            
        } catch (error) {
            console.error("[LICENCIAS] Error verificando:", error);
            
            // Si hay error de red, usar cache con advertencia
            if (this.licenciaActual) {
                this.actualizarUILicencia('verificando', null);
            }
            
            return false;
        }
    },
    
    actualizarUILicencia(estado, fechaExpiracion) {
        const badge = document.getElementById('statusLicenciaGlobal');
        const detalleTexto = document.getElementById('detalleLicenciaTexto');
        const licenciaKeyDisplay = document.getElementById('licenciaKeyDisplay');
        
        if (!badge) return;
        
        // Actualizar badge
        badge.className = 'px-4 py-2 rounded-full flex items-center gap-2 text-sm font-bold border';
        
        switch(estado) {
            case 'activa':
                badge.className += ' bg-emerald-50 text-emerald-700 border-emerald-100';
                badge.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-lucide="shield-check" class="lucide lucide-shield-check w-4 h-4"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path><path d="m9 12 2 2 4-4"></path></svg>
                    Suscripción Activa
                `;
                this.habilitarVentas(true);
                break;
                
            case 'suspendida':
                badge.className += ' bg-red-50 text-red-700 border-red-100';
                badge.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-lucide="shield-off" class="lucide lucide-shield-off w-4 h-4"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path><path d="M2 2l20 20"></path></svg>
                    Suscripción Suspendida
                `;
                this.habilitarVentas(false);
                this.mostrarMensajeSuspension();
                break;
                
            case 'sin_licencia':
                badge.className += ' bg-slate-100 text-slate-600 border-slate-200';
                badge.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-lucide="key" class="lucide lucide-key w-4 h-4"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"></path><path d="m21 2-9.6 9.6"></path><circle cx="7.5" cy="15.5" r="5.5"></circle></svg>
                    Sin Licencia
                `;
                this.habilitarVentas(false);
                break;
                
            case 'verificando':
                badge.className += ' bg-amber-50 text-amber-700 border-amber-100';
                badge.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-lucide="loader" class="lucide lucide-loader w-4 h-4 animate-spin"><path d="M12 2v4"></path><path d="M12 18v4"></path><path d="m4.93 4.93 2.83 2.83"></path><path d="m16.24 16.24 2.83 2.83"></path><path d="M2 12h4"></path><path d="M18 12h4"></path><path d="m4.93 19.07 2.83-2.83"></path><path d="m16.24 7.76 2.83-2.83"></path></svg>
                    Verificando...
                `;
                this.habilitarVentas(false);
                break;
        }
        
        // Actualizar detalle de licencia
        if (detalleTexto) {
            if (this.licenciaActual) {
                const plan = this.licenciaActual.plan || 'Profesional';
                if (fechaExpiracion) {
                    detalleTexto.textContent = `Plan ${plan} - Vence: ${fechaExpiracion.toLocaleDateString('es-VE')}`;
                } else {
                    detalleTexto.textContent = `Plan ${plan}`;
                }
            } else {
                detalleTexto.textContent = 'Sin licencia asignada';
            }
        }
        
        // Mostrar clave de licencia
        if (licenciaKeyDisplay && this.licenciaActual?.key) {
            const key = this.licenciaActual.key;
            licenciaKeyDisplay.textContent = key.length > 12 ? '••••' + key.slice(-8) : key;
            licenciaKeyDisplay.title = key;
        } else if (licenciaKeyDisplay) {
            licenciaKeyDisplay.textContent = 'Sin licencia';
        }
        
        // Refrescar iconos
        if (window.lucide) lucide.createIcons();
    },
    
    habilitarVentas(habilitar) {
        const btnProcesar = document.getElementById('btnProcesarVenta');
        if (btnProcesar) {
            btnProcesar.disabled = !habilitar;
        }
        
        const tabVentas = document.querySelector('.tab-btn[data-tab="ventas"]');
        if (tabVentas) {
            if (habilitar) {
                tabVentas.classList.remove('opacity-50', 'pointer-events-none');
                tabVentas.title = '';
            } else {
                tabVentas.classList.add('opacity-50', 'pointer-events-none');
                tabVentas.title = 'Licencia no activa';
            }
        }
    },
    
    mostrarMensajeSuspension() {
        const infoMessage = document.getElementById('infoMessage');
        if (!infoMessage) return;
        
        if (!infoMessage.dataset.originalHtml) {
            infoMessage.dataset.originalHtml = infoMessage.innerHTML;
        }
        
        infoMessage.className = 'mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl flex items-center gap-3';
        infoMessage.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-lucide="alert-triangle" class="lucide lucide-alert-triangle text-red-600 w-5 h-5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
            <p class="text-red-800 text-sm font-medium">
                <span class="font-bold">LICENCIA SUSPENDIDA:</span> Su licencia ha vencido. Actualice para continuar.
            </p>
            <button onclick="GestionLicencias.restaurarMensajeOriginal()" class="ml-auto text-red-400 hover:text-red-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-lucide="x" class="w-4 h-4"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
            </button>
        `;
        
        if (window.lucide) lucide.createIcons();
    },
    
    restaurarMensajeOriginal() {
        const infoMessage = document.getElementById('infoMessage');
        if (infoMessage && infoMessage.dataset.originalHtml) {
            infoMessage.innerHTML = infoMessage.dataset.originalHtml;
            infoMessage.className = 'mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-xl flex items-center gap-3 animate-pulse';
            if (window.lucide) lucide.createIcons();
        }
    },
    
    async obtenerLimiteVendedores() {
        if (!this.licenciaActual) {
            await this.cargarLicenciaUsuario();
        }
        
        return this.licenciaActual?.limite_vendedores || 0;
    },
    
    async contarVendedoresActuales() {
        try {
            const user = window.pb.authStore.model;
            if (!user) return 0;
            
            const vendedores = await window.pb.collection('vendedores').getFullList({
                filter: `admin_id = "${user.id}"`,
                requestKey: `conteo_${Date.now()}`,
                $autoCancel: false
            });
            
            return vendedores.length;
        } catch (error) {
            console.error("[LICENCIAS] Error contando vendedores:", error);
            return 0;
        }
    },
    
    async actualizarContadorVendedores() {
        const contadorEl = document.getElementById('contadorVendedores');
        if (!contadorEl) return;
        
        try {
            const limite = await this.obtenerLimiteVendedores();
            const actuales = await this.contarVendedoresActuales();
            const disponibles = limite - actuales;
            
            contadorEl.textContent = `${actuales}/${limite} vendedores`;
            
            contadorEl.className = disponibles <= 0 ? 'text-xs font-bold px-2 py-1 bg-red-100 text-red-700 rounded-lg' :
                                   disponibles <= 2 ? 'text-xs font-bold px-2 py-1 bg-amber-100 text-amber-700 rounded-lg' :
                                   'text-xs font-bold px-2 py-1 bg-blue-100 text-blue-700 rounded-lg';
            
            return disponibles;
        } catch (error) {
            console.error("[LICENCIAS] Error:", error);
            contadorEl.textContent = 'Error';
            return 0;
        }
    }
};

// ======================================================
// SEGURIDAD PRINCIPAL (VERSIÓN FINAL CORREGIDA)
// ======================================================

const AuthSecurity = {
    LIMITES: {
        admin: 1,
        vendedor: 4,
        usuario: 2
    },
    
    _heartbeatInterval: null,
    _inactividadInterval: null,
    _ultimaActividad: Date.now(),
    _reconectando: false,
    _sesionPresaLimpia: false,
    _validandoSesion: false, // Bandera para evitar loops
    
    async inicializar() {
        console.log("[SEGURIDAD] Inicializando...");
        
        window.GestionLicencias = GestionLicencias;
        await GestionLicencias.inicializar();
        
        // Configurar detección de actividad
        this.configurarDeteccionActividad();
        
        // Iniciar monitoreo de inactividad
        this.iniciarMonitoreoInactividad();
        
        if (window.pb.authStore.isValid) {
            await this.validarSesionUnica();
            
            // Limpiar sesiones presas al iniciar
            await this.limpiarSesionesPresas();
        }
        
        // Escuchar cambios en autenticación (CORREGIDO)
        window.pb.authStore.onChange(async (token) => {
            if (token) {
                this._ultimaActividad = Date.now();
                
                // Solo ejecutar si NO estamos ya en una validación
                if (!this._validandoSesion) {
                    setTimeout(async () => {
                        await this.validarSesionUnica();
                        await GestionLicencias.cargarLicenciaUsuario();
                        await this.limpiarSesionesPresas();
                    }, 500);
                }
            } else {
                this.detenerMonitoreoInactividad();
                this.detenerHeartbeat();
            }
        });
        
        console.log("[SEGURIDAD] Listo");
    },
    
    // ======================================================
    // DETECCIÓN DE ACTIVIDAD DEL USUARIO
    // ======================================================
    
    configurarDeteccionActividad() {
        const eventos = ['mousedown', 'keydown', 'mousemove', 'scroll', 'touchstart', 'click'];
        
        const actualizarActividad = () => {
            this._ultimaActividad = Date.now();
        };
        
        eventos.forEach(evento => {
            document.addEventListener(evento, actualizarActividad, { passive: true });
        });
        
        // Guardar para posible limpieza
        this._limpiarActividad = () => {
            eventos.forEach(evento => {
                document.removeEventListener(evento, actualizarActividad);
            });
        };
    },
    
    iniciarMonitoreoInactividad() {
        if (this._inactividadInterval) {
            clearInterval(this._inactividadInterval);
        }
        
        this._inactividadInterval = setInterval(() => {
            this.verificarInactividad();
        }, SEGURIDAD_CONFIG.INACTIVITY_CHECK_INTERVAL);
    },
    
    detenerMonitoreoInactividad() {
        if (this._inactividadInterval) {
            clearInterval(this._inactividadInterval);
            this._inactividadInterval = null;
        }
        
        if (this._limpiarActividad) {
            this._limpiarActividad();
        }
    },
    
    async verificarInactividad() {
        if (!window.pb.authStore.isValid || !window.Sistema?.estado?.usuario) {
            return;
        }
        
        const tiempoInactivo = Date.now() - this._ultimaActividad;
        
        if (tiempoInactivo >= SEGURIDAD_CONFIG.INACTIVITY_TIMEOUT) {
            console.log("[SEGURIDAD] Usuario inactivo por 30 minutos, cerrando sesión");
            
            await Swal.fire({
                icon: 'info',
                title: 'Sesión Expirada',
                text: 'Has estado inactivo por 30 minutos. Por seguridad, tu sesión ha sido cerrada.',
                confirmButtonText: 'Entendido'
            });
            
            await this.cerrarSesionPorInactividad();
        } else if (tiempoInactivo >= SEGURIDAD_CONFIG.INACTIVITY_TIMEOUT - (5 * 60 * 1000)) {
            // Advertencia 5 minutos antes
            console.log("[SEGURIDAD] Usuario inactivo por 25 minutos, mostrando advertencia");
            
            // Mostrar advertencia solo si no hay un toast ya
            if (!document.querySelector('.toast-warning')) {
                window.Sistema?.mostrarToast('Tu sesión cerrará en 5 minutos por inactividad', 'warning');
            }
        }
    },
    
    async cerrarSesionPorInactividad() {
        try {
            if (window.Sistema?.estado?.usuario) {
                await window.pb.collection('users').update(window.Sistema.estado.usuario.id, {
                    session_id: "",
                    is_online: false,
                    last_seen: new Date().toISOString()
                }).catch(e => console.warn("[SEGURIDAD] Error actualizando estado:", e));
            }
        } finally {
            // Limpiar todo
            window.Sistema?.cancelarPeticionesPendientes?.();
            window.pb.authStore.clear();
            window.Sistema?.limpiarSesionLocal?.();
            window.Sistema?.mostrarVistaLogin?.();
            
            this.detenerMonitoreoInactividad();
            this.detenerHeartbeat();
        }
    },
    
    // ======================================================
    // LIMPIEZA DE SESIONES PRESAS
    // ======================================================
    
    async limpiarSesionesPresas() {
        if (this._sesionPresaLimpia) return;
        
        try {
            console.log("[SEGURIDAD] Limpiando sesiones presas...");
            
            const user = window.pb.authStore.model;
            if (!user) return;
            
            // Buscar sesiones de este usuario con last_seen muy antiguo
            const fechaLimite = new Date(Date.now() - SEGURIDAD_CONFIG.SESSION_ORPHAN_TIMEOUT).toISOString();
            
            const sesionesActivas = await window.pb.collection('users').getFullList({
                filter: `id = "${user.id}" && is_online = true && last_seen < "${fechaLimite}"`,
                requestKey: `limpiar_${Date.now()}`,
                $autoCancel: false
            }).catch(e => {
                console.warn("[SEGURIDAD] Error buscando sesiones presas:", e);
                return [];
            });
            
            if (sesionesActivas.length > 0) {
                console.log(`[SEGURIDAD] Limpiando ${sesionesActivas.length} sesiones presas`);
                
                // Marcar como offline
                await window.pb.collection('users').update(user.id, {
                    is_online: false,
                    session_id: ""
                }).catch(e => console.warn("[SEGURIDAD] Error limpiando sesión:", e));
            }
            
            this._sesionPresaLimpia = true;
            
        } catch (error) {
            console.error("[SEGURIDAD] Error limpiando sesiones presas:", error);
        }
    },
    
    // ======================================================
    // RECONEXIÓN AUTOMÁTICA
    // ======================================================
    
    async intentarReconexion() {
        if (this._reconectando) return;
        
        this._reconectando = true;
        
        for (let intento = 1; intento <= SEGURIDAD_CONFIG.RECONEXION_INTENTOS; intento++) {
            try {
                console.log(`[SEGURIDAD] Intento de reconexión ${intento}/${SEGURIDAD_CONFIG.RECONEXION_INTENTOS}`);
                
                // Esperar con backoff exponencial
                await this.esperar(SEGURIDAD_CONFIG.RECONEXION_BASE_DELAY * Math.pow(1.5, intento - 1));
                
                // Intentar una petición simple para verificar conexión
                await window.pb.health.check();
                
                console.log("[SEGURIDAD] Reconexión exitosa");
                
                // Si hay sesión, validar
                if (window.pb.authStore.isValid) {
                    await this.validarSesionUnica();
                }
                
                this._reconectando = false;
                return true;
                
            } catch (error) {
                console.warn(`[SEGURIDAD] Intento ${intento} falló:`, error.message);
            }
        }
        
        console.error("[SEGURIDAD] No se pudo reconectar después de varios intentos");
        
        // Mostrar mensaje al usuario
        if (window.Sistema?.estado?.usuario) {
            Swal.fire({
                icon: 'error',
                title: 'Error de Conexión',
                text: 'No se pudo restablecer la conexión con el servidor. Por favor, verifica tu internet.',
                confirmButtonText: 'Reintentar',
                showCancelButton: true,
                cancelButtonText: 'Cerrar Sesión'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    this._reconectando = false;
                    this.intentarReconexion();
                } else {
                    await this.cerrarSesionPorInactividad();
                }
            });
        }
        
        this._reconectando = false;
        return false;
    },
    
    esperar(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    // ======================================================
    // HEARTBEAT MEJORADO
    // ======================================================
    
    iniciarHeartbeat() {
        this.detenerHeartbeat();
        
        this._heartbeatInterval = setInterval(async () => {
            await this.ejecutarHeartbeat();
        }, SEGURIDAD_CONFIG.HEARTBEAT_INTERVAL);
    },
    
    detenerHeartbeat() {
        if (this._heartbeatInterval) {
            clearInterval(this._heartbeatInterval);
            this._heartbeatInterval = null;
        }
    },
    
    async ejecutarHeartbeat() {
        if (!window.Sistema?.estado?.usuario) return;
        
        try {
            // Actualizar last_seen (NO validar sesión completa)
            await window.pb.collection('users').update(window.Sistema.estado.usuario.id, {
                last_seen: new Date().toISOString()
            }, {
                requestKey: `heartbeat_${Date.now()}`,
                $autoCancel: false
            });
            
            // Verificar licencia
            if (window.GestionLicencias) {
                await window.GestionLicencias.verificarEstadoLicencia();
            }
            
        } catch (error) {
            if (error.status === 0) {
                // Error de red, intentar reconexión
                console.warn("[SEGURIDAD] Error de red en heartbeat");
                await this.intentarReconexion();
            } else if (error.status === 401 || error.status === 403) {
                console.warn("[HEARTBEAT] Sesión inválida, cerrando");
                await this.cerrarSesionPorInactividad();
            }
        }
    },
    
    // ======================================================
    // FINGERPRINT MEJORADO (CON CANVAS PARA MAYOR SEGURIDAD)
    // ======================================================
    
    generarFingerprint() {
        const componentes = [
            navigator.userAgent,
            screen.width,
            screen.height,
            navigator.language,
            new Date().getTimezoneOffset(),
            navigator.hardwareConcurrency || 'unknown',
            navigator.platform || 'unknown',
            screen.colorDepth || 'unknown',
            // Elementos adicionales para mayor unicidad
            navigator.deviceMemory || 'unknown',
            navigator.maxTouchPoints || 'unknown',
            Intl.DateTimeFormat().resolvedOptions().timeZone,
            this.getCanvasFingerprint()
        ];
        
        const hash = componentes.join('|');
        let hashNumerico = 0;
        for (let i = 0; i < hash.length; i++) {
            hashNumerico = ((hashNumerico << 5) - hashNumerico) + hash.charCodeAt(i);
            hashNumerico |= 0;
        }
        
        return Math.abs(hashNumerico).toString(36).substring(0, 32);
    },
    
    // Canvas fingerprinting para mayor seguridad
    getCanvasFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 200;
            canvas.height = 50;
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillStyle = '#f60';
            ctx.fillRect(0, 0, 100, 50);
            ctx.fillStyle = '#069';
            ctx.fillText('SISOV', 2, 15);
            ctx.fillStyle = '#fff';
            ctx.fillText('PRO', 80, 30);
            return canvas.toDataURL().slice(0, 50);
        } catch (e) {
            return 'canvas-error';
        }
    },
    
    // ======================================================
    // VALIDACIÓN DE SESIÓN (CORREGIDA - SIN LOOP Y CON API CORRECTA)
    // ======================================================
    
    async validarSesionUnica() {
        // Prevenir loop infinito
        if (this._validandoSesion) {
            console.log("[SEGURIDAD] Ya validando sesión, ignorando...");
            return true;
        }
        
        this._validandoSesion = true;
        
        const user = window.pb.authStore.model;
        if (!user) {
            this._validandoSesion = false;
            return false;
        }
        
        const fingerprint = this.generarFingerprint();
        
        try {
            // CORREGIDO: Usar getFirstListItem en lugar de getOne para colecciones auth
            const serverUser = await window.pb.collection('users').getFirstListItem(`id = "${user.id}"`, {
                requestKey: `validar_${Date.now()}`,
                $autoCancel: false
            });
            
            // Validar sesión duplicada
            if (serverUser.is_online && serverUser.session_id && serverUser.session_id !== fingerprint) {
                const result = await Swal.fire({
                    icon: 'error',
                    title: 'Acceso Restringido',
                    text: 'Esta cuenta ya está activa en otro dispositivo. Si crees que es un error, espera unos minutos o cierra sesión en el otro dispositivo.',
                    confirmButtonText: 'Cerrar',
                    showCancelButton: true,
                    cancelButtonText: 'Forzar Acceso'
                });
                
                if (result.isConfirmed) {
                    window.pb.authStore.clear();
                    this._validandoSesion = false;
                    return false;
                } else {
                    // Forzar acceso: marcar la otra sesión como offline
                    await window.pb.collection('users').update(user.id, {
                        is_online: false,
                        session_id: ""
                    });
                }
            }
            
            // Validar límite por rol
            const limiteTiempo = new Date(Date.now() - 60000).toISOString();
            
            const activos = await window.pb.collection('users').getList(1, 1, {
                filter: `user_role = "${serverUser.user_role}" && is_online = true && id != "${user.id}" && last_seen > "${limiteTiempo}"`,
                requestKey: `limite_${Date.now()}`,
                $autoCancel: false
            });
            
            const limite = this.LIMITES[serverUser.user_role] || 2;
            if (activos.totalItems >= limite) {
                await Swal.fire({
                    icon: 'warning',
                    title: 'Límite Alcanzado',
                    text: `Ya hay ${limite} sesiones activas de ${serverUser.user_role}.`,
                });
                window.pb.authStore.clear();
                this._validandoSesion = false;
                return false;
            }
            
            // Registrar sesión
            await this.registrarSesion(user.id, fingerprint);
            
            // Iniciar heartbeat
            this.iniciarHeartbeat();
            
            console.log("[SEGURIDAD] Sesión validada");
            this._validandoSesion = false;
            return true;
            
        } catch (error) {
            console.error("[SEGURIDAD] Error:", error);
            
            if (error.status === 0) {
                console.warn("[SEGURIDAD] Error de red, usando sesión local");
                this.iniciarHeartbeat();
                this._validandoSesion = false;
                return true;
            }
            
            this._validandoSesion = false;
            return true;
        }
    },
    
    async registrarSesion(userId, fingerprint) {
        await window.pb.collection('users').update(userId, {
            session_id: fingerprint,
            is_online: true,
            last_seen: new Date().toISOString()
        }, {
            requestKey: `registro_${Date.now()}`,
            $autoCancel: false
        });
    }
};

// Inicializar
if (window.Sistema) {
    AuthSecurity.inicializar();
}

// Exponer configuración para otros módulos
window.SEGURIDAD_CONFIG = SEGURIDAD_CONFIG;