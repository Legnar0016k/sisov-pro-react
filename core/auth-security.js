/**
 * @file auth-security.js
 * @description Seguridad mejorada y GESTIÓN DE LICENCIAS unificada.
 * @fix Corregido manejo de expiración y renovación de licencias
 */

// ======================================================
// CONFIGURACIÓN DE SEGURIDAD
// ======================================================

const SEGURIDAD_CONFIG = {
    INACTIVITY_TIMEOUT: 30 * 60 * 1000,
    INACTIVITY_CHECK_INTERVAL: 60 * 1000,
    HEARTBEAT_INTERVAL: 60 * 1000,
    RECONEXION_INTENTOS: 5,
    RECONEXION_BASE_DELAY: 2000,
    SESSION_ORPHAN_TIMEOUT: 5 * 60 * 1000,
    LICENCIA_CACHE_TTL: 60000,
    LICENCIA_VERIFICACION_INTERVAL: 300000
};

// ======================================================
// SEGURIDAD PRINCIPAL
// ======================================================

const AuthSecurity = {
    LIMITES: {
        admin: 1,
        vendedor: 4,
        usuario: 2
    },

    _licenciaActual: null,
    _cargandoLicencia: false,
    _ultimaVerificacionLicencia: null,
    _intervaloVerificacionLicencia: null,
    
    _heartbeatInterval: null,
    _inactividadInterval: null,
    _ultimaActividad: Date.now(),
    _reconectando: false,
    _sesionPresaLimpia: false,
    _validandoSesion: false,
    _procesandoOnChange: false,
    _limpiarActividad: null,

    get licenciaActual() {
        return this._licenciaActual;
    },

    get licenciaEstado() {
        return this._licenciaActual?.estado || 'sin_licencia';
    },

    get licenciaEsActiva() {
        return this._licenciaActual?.estado === 'activa';
    },

    async inicializar() {
        console.log("[SEGURIDAD] Inicializando...");
        
        this.configurarDeteccionActividad();
        this.iniciarMonitoreoInactividad();
        
        if (window.pb?.authStore?.isValid) {
            await this.cargarLicenciaUsuario();
            await this.limpiarSesionesPresas();
        }
        
        window.pb?.authStore?.onChange(async (token) => {
            if (this._procesandoOnChange) {
                console.log("[SEGURIDAD] Ignorando onChange recursivo");
                return;
            }
            
            this._procesandoOnChange = true;
            
            try {
                if (token) {
                    this._ultimaActividad = Date.now();
                    console.log("[SEGURIDAD] Token detectado, actualizando estado");
                    
                    await this.cargarLicenciaUsuario(true);
                    
                    if (window.pb?.authStore?.isValid) {
                        this.iniciarHeartbeat();
                    }
                } else {
                    console.log("[SEGURIDAD] Sesión cerrada, limpiando estado");
                    this.detenerMonitoreoInactividad();
                    this.detenerHeartbeat();
                    this._licenciaActual = null;
                    this.detenerVerificacionPeriodicaLicencia();
                }
            } finally {
                setTimeout(() => {
                    this._procesandoOnChange = false;
                }, 1000);
            }
        });

        this.iniciarVerificacionPeriodicaLicencia();
        
        console.log("[SEGURIDAD] Listo");
    },

    // ======================================================
    // DETECCIÓN DE ACTIVIDAD
    // ======================================================
    
    configurarDeteccionActividad() {
        const eventos = ['mousedown', 'keydown', 'mousemove', 'scroll', 'touchstart', 'click'];
        const actualizarActividad = () => { this._ultimaActividad = Date.now(); };
        eventos.forEach(evento => {
            document.addEventListener(evento, actualizarActividad, { passive: true });
        });
        this._limpiarActividad = () => {
            eventos.forEach(evento => document.removeEventListener(evento, actualizarActividad));
        };
    },
    
    iniciarMonitoreoInactividad() {
        if (this._inactividadInterval) clearInterval(this._inactividadInterval);
        this._inactividadInterval = setInterval(() => this.verificarInactividad(), SEGURIDAD_CONFIG.INACTIVITY_CHECK_INTERVAL);
    },
    
    detenerMonitoreoInactividad() {
        if (this._inactividadInterval) {
            clearInterval(this._inactividadInterval);
            this._inactividadInterval = null;
        }
        if (this._limpiarActividad) this._limpiarActividad();
    },
    
    async verificarInactividad() {
        if (!window.pb?.authStore?.isValid || !window.Sistema?.estado?.usuario) return;
        const tiempoInactivo = Date.now() - this._ultimaActividad;
        
        if (tiempoInactivo >= SEGURIDAD_CONFIG.INACTIVITY_TIMEOUT) {
            console.log("[SEGURIDAD] Usuario inactivo, cerrando sesión");
            await Swal.fire({ icon: 'info', title: 'Sesión Expirada', text: 'Has estado inactivo por 30 minutos.', confirmButtonText: 'Entendido' });
            await this.cerrarSesionPorInactividad();
        } else if (tiempoInactivo >= SEGURIDAD_CONFIG.INACTIVITY_TIMEOUT - (5 * 60 * 1000)) {
            if (!document.querySelector('.toast-warning')) {
                window.Sistema?.mostrarToast('Tu sesión cerrará en 5 minutos por inactividad', 'warning');
            }
        }
    },
    
    async cerrarSesionPorInactividad() {
        try {
            if (window.Sistema?.estado?.usuario) {
                await window.pb.collection('users').update(window.Sistema.estado.usuario.id, {
                    session_id: "", is_online: false, last_seen: new Date().toISOString()
                }).catch(e => console.warn("[SEGURIDAD] Error actualizando estado:", e));
            }
        } finally {
            window.Sistema?.cancelarPeticionesPendientes?.();
            window.pb?.authStore.clear();
            window.Sistema?.limpiarSesionLocal?.();
            window.Sistema?.mostrarVistaLogin?.();
            this.detenerMonitoreoInactividad();
            this.detenerHeartbeat();
            this._licenciaActual = null;
            this.detenerVerificacionPeriodicaLicencia();
        }
    },

    // ======================================================
    // GESTIÓN DE LICENCIAS (VERSIÓN CORREGIDA)
    // ======================================================

    iniciarVerificacionPeriodicaLicencia() {
        if (this._intervaloVerificacionLicencia) clearInterval(this._intervaloVerificacionLicencia);
        this._intervaloVerificacionLicencia = setInterval(() => {
            if (window.pb?.authStore?.isValid && !this._procesandoOnChange) {
                this.verificarEstadoLicencia().catch(e => console.warn("[LICENCIAS] Error en verif. periódica:", e));
            }
        }, SEGURIDAD_CONFIG.LICENCIA_VERIFICACION_INTERVAL);
    },

    detenerVerificacionPeriodicaLicencia() {
        if (this._intervaloVerificacionLicencia) {
            clearInterval(this._intervaloVerificacionLicencia);
            this._intervaloVerificacionLicencia = null;
        }
    },

    async cargarLicenciaUsuario(forzar = false) {
        if (this._cargandoLicencia) {
            console.log("[LICENCIAS] Ya cargando, ignorando...");
            return this._licenciaActual;
        }

        if (!forzar && this._ultimaVerificacionLicencia && (Date.now() - this._ultimaVerificacionLicencia) < SEGURIDAD_CONFIG.LICENCIA_CACHE_TTL) {
            console.log("[LICENCIAS] Usando cache");
            return this._licenciaActual;
        }

        this._cargandoLicencia = true;

        try {
            const user = window.pb?.authStore?.model;
            if (!user?.id) {
                console.log("[LICENCIAS] No hay usuario autenticado");
                this._licenciaActual = null;
                this.actualizarUILicencia('sin_licencia', null);
                return null;
            }

            console.log("[LICENCIAS] Buscando licencia para:", user.id);

            // Buscar licencia activa del usuario (solo por user_id, sin importar active)
            const licencias = await window.pb.collection('licencias').getFullList({
                filter: `user_id = "${user.id}"`,
                sort: '-created',
                requestKey: `licencia_${Date.now()}`,
                $autoCancel: true,
                $cancelKey: `licencia_user_${user.id}`
            }).catch(error => {
                if (error.status === 0 || error.name === 'AbortError') {
                    console.warn("[LICENCIAS] Error de red, usando cache");
                    return this._licenciaActual ? [this._licenciaActual] : [];
                }
                throw error;
            });

            if (licencias && licencias.length > 0) {
                // Tomar la licencia más reciente
                this._licenciaActual = licencias[0];
                console.log("[LICENCIAS] Licencia encontrada:", this._licenciaActual.key);
                
                // Verificar expiración
                await this.verificarEstadoLicencia();
                
                this._ultimaVerificacionLicencia = Date.now();
                return this._licenciaActual;
            } else {
                console.log("[LICENCIAS] No hay licencia asignada");
                this._licenciaActual = null;
                this.actualizarUILicencia('sin_licencia', null);
            }
            return null;

        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("[LICENCIAS] Error:", error);
                window.Sistema?.manejarError('cargar_licencia', error, false);
            }
            return null;
        } finally {
            this._cargandoLicencia = false;
        }
    },

 async verificarEstadoLicencia() {
    if (!this._licenciaActual) return false;

    try {
        // Obtener datos actualizados del servidor
        const licenciaServer = await window.pb.collection('licencias').getOne(
            this._licenciaActual.id,
            { 
                requestKey: `verificar_${Date.now()}`, 
                $autoCancel: true,
                $cancelKey: `verificar_licencia_${this._licenciaActual.id}`
            }
        ).catch(error => {
            if (error.status === 0 || error.name === 'AbortError') {
                console.warn("[LICENCIAS] Error de red en verificación");
                return this._licenciaActual;
            }
            throw error;
        });

        this._licenciaActual = licenciaServer;

        // Verificar expiración
        const hoy = new Date();
        const fechaExpiracion = licenciaServer.expired ? new Date(licenciaServer.expired) : null;
        let estadoActual = licenciaServer.estado || 'activa';
        
        // 🔥 CORRECCIÓN: Si la licencia está activa pero ya expiró, actualizar estado
        // PERO SOLO SI ESTÁ ACTIVA - no tocar si ya está suspendida
        if (fechaExpiracion && fechaExpiracion < hoy && estadoActual === 'activa') {
            console.log("[LICENCIAS] Licencia expirada, actualizando estado");
            
            estadoActual = 'suspendida';
            
            // Actualizar en el servidor
            await window.pb.collection('licencias').update(licenciaServer.id, {
                estado: 'suspendida',
                active: false
            }).catch(e => console.warn("[LICENCIAS] Error actualizando licencia:", e));
            
            this._licenciaActual.estado = 'suspendida';
            this._licenciaActual.active = false;
        } 
        // 🔥 IMPORTANTE: Si la licencia está suspendida, NO la reactivamos automáticamente
        // Solo se reactiva si el usuario la edita manualmente o asigna una nueva

        this.actualizarUILicencia(estadoActual, fechaExpiracion);
        return estadoActual === 'activa';

    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error("[LICENCIAS] Error verificando:", error);
            if (this._licenciaActual) {
                this.actualizarUILicencia('verificando', null);
            }
        }
        return false;
    }
},

    // ======================================================
    // ACTIVACIÓN/RENOVACIÓN DE LICENCIA (CORREGIDO)
    // ======================================================

    async activarLicencia(key) {
        try {
            const user = window.pb?.authStore?.model;
            if (!user) throw new Error("Usuario no autenticado");

            console.log("[LICENCIAS] Activando licencia:", key);

            // Buscar la licencia por su key
            const licencias = await window.pb.collection('licencias').getFullList({
                filter: `key = "${key}"`,
                requestKey: `buscar_licencia_${Date.now()}`,
                $autoCancel: true
            });

            if (licencias.length === 0) {
                window.Sistema?.mostrarToast('Clave de licencia no válida', 'error');
                return false;
            }

            const nuevaLicencia = licencias[0];

            // Verificar si ya tiene un usuario asignado
            if (nuevaLicencia.user_id) {
                window.Sistema?.mostrarToast('Esta licencia ya está siendo utilizada por otro usuario', 'error');
                return false;
            }

            // Verificar fecha de expiración
            const fechaExp = nuevaLicencia.expired ? new Date(nuevaLicencia.expired) : null;
            if (fechaExp && fechaExp < new Date()) {
                window.Sistema?.mostrarToast('Esta licencia ya ha expirado', 'error');
                return false;
            }

            // INICIO DE TRANSACCIÓN: Desactivar licencia anterior si existe
            if (this._licenciaActual) {
                console.log("[LICENCIAS] Desactivando licencia anterior:", this._licenciaActual.key);
                
                // Desactivar la licencia anterior
                await window.pb.collection('licencias').update(this._licenciaActual.id, {
                    user_id: null,           // Liberar el usuario
                    estado: 'disponible',      // Cambiar estado a disponible
                    active: false
                }).catch(e => console.warn("[LICENCIAS] Error desactivando licencia anterior:", e));
            }

            // Actualizar la nueva licencia con el usuario actual
            await window.pb.collection('licencias').update(nuevaLicencia.id, {
                user_id: user.id,
                estado: 'activa',
                active: true,
                fecha_activacion: new Date().toISOString()
            });

            // Actualizar el usuario con el ID de la nueva licencia
            await window.pb.collection('users').update(user.id, { 
                licence_id: nuevaLicencia.id 
            });

            window.Sistema?.mostrarToast('Licencia activada correctamente', 'success');
            
            // Recargar la licencia actual
            await this.cargarLicenciaUsuario(true);
            
            return true;

        } catch (error) {
            console.error('[LICENCIAS] Error activando licencia:', error);
            window.Sistema?.mostrarToast('Error al activar la licencia', 'error');
            return false;
        }
    },

    // ======================================================
    // UI DE LICENCIAS
    // ======================================================

    actualizarUILicencia(estado, fechaExpiracion) {
        const badge = document.getElementById('statusLicenciaGlobal');
        const detalleTexto = document.getElementById('detalleLicenciaTexto');
        const licenciaKeyDisplay = document.getElementById('licenciaKeyDisplay');
        const btnProcesar = document.getElementById('btnProcesarVenta');
        const tabVentas = document.querySelector('.tab-btn[data-tab="ventas"]');

        if (!badge) return;

        badge.className = 'px-4 py-2 rounded-full flex items-center gap-2 text-sm font-bold border';

        switch(estado) {
            case 'activa':
                badge.className += ' bg-emerald-50 text-emerald-700 border-emerald-100';
                badge.innerHTML = `<i data-lucide="shield-check" class="w-4 h-4"></i> Suscripción Activa`;
                this.habilitarModuloVentas(true);
                break;
            case 'suspendida':
                badge.className += ' bg-red-50 text-red-700 border-red-100';
                badge.innerHTML = `<i data-lucide="shield-off" class="w-4 h-4"></i> Suscripción Suspendida`;
                this.habilitarModuloVentas(false);
                this.mostrarMensajeSuspension();
                break;
            case 'disponible':
                badge.className += ' bg-amber-50 text-amber-700 border-amber-100';
                badge.innerHTML = `<i data-lucide="key" class="w-4 h-4"></i> Licencia Disponible`;
                this.habilitarModuloVentas(false);
                break;
            case 'sin_licencia':
                badge.className += ' bg-slate-100 text-slate-600 border-slate-200';
                badge.innerHTML = `<i data-lucide="key" class="w-4 h-4"></i> Sin Licencia`;
                this.habilitarModuloVentas(false);
                break;
            case 'verificando':
                badge.className += ' bg-amber-50 text-amber-700 border-amber-100';
                badge.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Verificando...`;
                this.habilitarModuloVentas(false);
                break;
        }

        if (detalleTexto) {
            if (this._licenciaActual) {
                const plan = this._licenciaActual.plan || 'Profesional';
                if (fechaExpiracion) {
                    detalleTexto.textContent = `Plan ${plan} - Vence: ${fechaExpiracion.toLocaleDateString('es-VE')}`;
                } else {
                    detalleTexto.textContent = `Plan ${plan}`;
                }
            } else {
                detalleTexto.textContent = 'Sin licencia asignada';
            }
        }

        if (licenciaKeyDisplay) {
            const key = this._licenciaActual?.key;
            if (key) {
                licenciaKeyDisplay.textContent = key.length > 12 ? '••••' + key.slice(-8) : key;
                licenciaKeyDisplay.title = key;
            } else {
                licenciaKeyDisplay.textContent = 'Sin licencia';
            }
        }

        if (window.lucide) lucide.createIcons();
    },

    habilitarModuloVentas(habilitar) {
        const btnProcesar = document.getElementById('btnProcesarVenta');
        if (btnProcesar) btnProcesar.disabled = !habilitar;

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
            <i data-lucide="alert-triangle" class="text-red-600 w-5 h-5"></i>
            <p class="text-red-800 text-sm font-medium">
                <span class="font-bold">LICENCIA SUSPENDIDA:</span> Su licencia ha vencido. Actualice para continuar.
            </p>
            <button onclick="AuthSecurity.restaurarMensajeOriginal()" class="ml-auto text-red-400 hover:text-red-600">
                <i data-lucide="x" class="w-4 h-4"></i>
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
        if (!this._licenciaActual) await this.cargarLicenciaUsuario();
        return this._licenciaActual?.limite_vendedores || 0;
    },

    async contarVendedoresActuales() {
        try {
            const user = window.pb?.authStore?.model;
            if (!user) return 0;
            const vendedores = await window.pb.collection('vendedores').getFullList({
                filter: `admin_id = "${user.id}"`,
                requestKey: `conteo_${Date.now()}`,
                $autoCancel: true
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
    },

    copiarLicenciaAlPortapapeles() {
        const key = this._licenciaActual?.key;
        if (key) {
            navigator.clipboard.writeText(key).then(() => {
                window.Sistema?.mostrarToast('Clave copiada', 'success');
            }).catch(() => {
                window.Sistema?.mostrarToast('Error al copiar', 'error');
            });
        }
    },

    // ======================================================
    // LIMPIEZA DE SESIONES PRESAS
    // ======================================================
    
    async limpiarSesionesPresas() {
        if (this._sesionPresaLimpia) return;
        try {
            console.log("[SEGURIDAD] Limpiando sesiones presas...");
            const user = window.pb?.authStore?.model;
            if (!user) return;

            const fechaLimite = new Date(Date.now() - SEGURIDAD_CONFIG.SESSION_ORPHAN_TIMEOUT).toISOString();
            const sesionesActivas = await window.pb.collection('users').getFullList({
                filter: `id = "${user.id}" && is_online = true && last_seen < "${fechaLimite}"`,
                requestKey: `limpiar_${Date.now()}`,
                $autoCancel: true
            }).catch(e => { console.warn("[SEGURIDAD] Error buscando sesiones presas:", e); return []; });

            if (sesionesActivas.length > 0) {
                console.log(`[SEGURIDAD] Limpiando ${sesionesActivas.length} sesiones presas`);
                await window.pb.collection('users').update(user.id, { is_online: false, session_id: "" })
                    .catch(e => console.warn("[SEGURIDAD] Error limpiando sesión:", e));
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
                await this.esperar(SEGURIDAD_CONFIG.RECONEXION_BASE_DELAY * Math.pow(1.5, intento - 1));
                await window.pb?.health?.check?.();

                console.log("[SEGURIDAD] Reconexión exitosa");
                if (window.pb?.authStore?.isValid && !this._procesandoOnChange) {
                    await this.cargarLicenciaUsuario();
                }
                this._reconectando = false;
                return true;
            } catch (error) {
                console.warn(`[SEGURIDAD] Intento ${intento} falló:`, error.message);
            }
        }

        console.error("[SEGURIDAD] No se pudo reconectar");
        if (window.Sistema?.estado?.usuario) {
            Swal.fire({
                icon: 'error', title: 'Error de Conexión',
                text: 'No se pudo restablecer la conexión con el servidor.',
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

    esperar(ms) { return new Promise(resolve => setTimeout(resolve, ms)); },

    // ======================================================
    // HEARTBEAT
    // ======================================================
    
    iniciarHeartbeat() {
        this.detenerHeartbeat();
        this._heartbeatInterval = setInterval(async () => { 
            if (!this._procesandoOnChange) {
                await this.ejecutarHeartbeat(); 
            }
        }, SEGURIDAD_CONFIG.HEARTBEAT_INTERVAL);
    },
    
    detenerHeartbeat() {
        if (this._heartbeatInterval) {
            clearInterval(this._heartbeatInterval);
            this._heartbeatInterval = null;
        }
    },
    
    async ejecutarHeartbeat() {
        if (!window.Sistema?.estado?.usuario || this._procesandoOnChange) return;
        try {
            await window.pb.collection('users').update(window.Sistema.estado.usuario.id, {
                last_seen: new Date().toISOString()
            }, { 
                requestKey: `heartbeat_${Date.now()}`, 
                $autoCancel: true,
                $cancelKey: 'heartbeat'
            });

            if (window.pb?.authStore?.isValid && !this._procesandoOnChange) {
                await this.verificarEstadoLicencia();
            }
        } catch (error) {
            if (error.status === 0) {
                console.warn("[SEGURIDAD] Error de red en heartbeat");
                await this.intentarReconexion();
            } else if (error.status === 401 || error.status === 403) {
                console.warn("[HEARTBEAT] Sesión inválida, cerrando");
                await this.cerrarSesionPorInactividad();
            }
        }
    },

    // ======================================================
    // FINGERPRINT
    // ======================================================
    
    generarFingerprint() {
        const componentes = [
            navigator.userAgent, screen.width, screen.height, navigator.language,
            new Date().getTimezoneOffset(), navigator.hardwareConcurrency || 'unknown',
            navigator.platform || 'unknown', screen.colorDepth || 'unknown',
            navigator.deviceMemory || 'unknown', navigator.maxTouchPoints || 'unknown',
            Intl.DateTimeFormat().resolvedOptions().timeZone, this.getCanvasFingerprint()
        ];
        const hash = componentes.join('|');
        let hashNumerico = 0;
        for (let i = 0; i < hash.length; i++) {
            hashNumerico = ((hashNumerico << 5) - hashNumerico) + hash.charCodeAt(i);
            hashNumerico |= 0;
        }
        return Math.abs(hashNumerico).toString(36).substring(0, 32);
    },

    getCanvasFingerprint() {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 200; canvas.height = 50;
            ctx.textBaseline = 'top'; ctx.font = '14px Arial';
            ctx.fillStyle = '#f60'; ctx.fillRect(0, 0, 100, 50);
            ctx.fillStyle = '#069'; ctx.fillText('SISOV', 2, 15);
            ctx.fillStyle = '#fff'; ctx.fillText('PRO', 80, 30);
            return canvas.toDataURL().slice(0, 50);
        } catch (e) { return 'canvas-error'; }
    },

    // ======================================================
    // VALIDACIÓN DE SESIÓN
    // ======================================================
    
    async validarSesionUnica() {
        if (this._validandoSesion) { 
            console.log("[SEGURIDAD] Ya validando sesión, ignorando..."); 
            return true; 
        }
        
        this._validandoSesion = true;
        const user = window.pb?.authStore?.model;
        
        if (!user) { 
            this._validandoSesion = false; 
            return false; 
        }
        
        const fingerprint = this.generarFingerprint();

        try {
            const serverUser = await window.pb.collection('users').getFirstListItem(`id = "${user.id}"`, {
                requestKey: `validar_${Date.now()}`, 
                $autoCancel: true
            });

            if (serverUser.is_online && serverUser.session_id && serverUser.session_id !== fingerprint) {
                const result = await Swal.fire({
                    icon: 'error', title: 'Acceso Restringido',
                    text: 'Esta cuenta ya está activa en otro dispositivo.',
                    confirmButtonText: 'Cerrar', showCancelButton: true, cancelButtonText: 'Forzar Acceso'
                });
                if (result.isConfirmed) {
                    window.pb.authStore.clear();
                    this._validandoSesion = false;
                    return false;
                } else {
                    await window.pb.collection('users').update(user.id, { is_online: false, session_id: "" });
                }
            }

            const limiteTiempo = new Date(Date.now() - 60000).toISOString();
            const activos = await window.pb.collection('users').getList(1, 1, {
                filter: `user_role = "${serverUser.user_role}" && is_online = true && id != "${user.id}" && last_seen > "${limiteTiempo}"`,
                requestKey: `limite_${Date.now()}`, 
                $autoCancel: true
            });

            const limite = this.LIMITES[serverUser.user_role] || 2;
            if (activos.totalItems >= limite) {
                await Swal.fire({ icon: 'warning', title: 'Límite Alcanzado', text: `Ya hay ${limite} sesiones activas.` });
                window.pb.authStore.clear();
                this._validandoSesion = false;
                return false;
            }

            await this.registrarSesion(user.id, fingerprint);
            console.log("[SEGURIDAD] Sesión validada");
            this._validandoSesion = false;
            return true;
        } catch (error) {
            console.error("[SEGURIDAD] Error:", error);
            this._validandoSesion = false;
            return true;
        }
    },

    async registrarSesion(userId, fingerprint) {
        await window.pb.collection('users').update(userId, {
            session_id: fingerprint, is_online: true, last_seen: new Date().toISOString()
        }, { requestKey: `registro_${Date.now()}`, $autoCancel: true });
    }
};

// Inicializar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AuthSecurity.inicializar());
} else {
    AuthSecurity.inicializar();
}

// Exponer configuración y el objeto principal
window.SEGURIDAD_CONFIG = SEGURIDAD_CONFIG;
window.AuthSecurity = AuthSecurity;