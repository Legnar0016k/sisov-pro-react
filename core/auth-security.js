/**
 * @file auth-security.js
 * @description Seguridad mejorada y GESTIÓN DE LICENCIAS unificada.
 */

// ======================================================
// CONFIGURACIÓN DE SEGURIDAD
// ======================================================

const SEGURIDAD_CONFIG = {
    INACTIVITY_TIMEOUT: 30 * 60 * 1000, // 30 minutos
    INACTIVITY_CHECK_INTERVAL: 60 * 1000, // 1 minuto
    HEARTBEAT_INTERVAL: 60 * 1000, // 1 minuto
    RECONEXION_INTENTOS: 5,
    RECONEXION_BASE_DELAY: 2000,
    SESSION_ORPHAN_TIMEOUT: 5 * 60 * 1000, // 5 minutos
    // [REFACTOR] Configuración de caché para licencias
    LICENCIA_CACHE_TTL: 60000, // 1 minuto
    LICENCIA_VERIFICACION_INTERVAL: 300000 // 5 minutos
};

// ======================================================
// SEGURIDAD PRINCIPAL (AHORA INCLUYE GESTIÓN DE LICENCIAS)
// ======================================================

const AuthSecurity = {
    LIMITES: {
        admin: 1,
        vendedor: 4,
        usuario: 2
    },

    // [REFACTOR] Propiedades de Licencias integradas
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
    _limpiarActividad: null,

    // Getters para exponer el estado de la licencia de forma controlada
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
        
        // Configurar detección de actividad
        this.configurarDeteccionActividad();
        
        // Iniciar monitoreo de inactividad
        this.iniciarMonitoreoInactividad();
        
        if (window.pb?.authStore?.isValid) {
            await this.validarSesionUnica();
            await this.limpiarSesionesPresas();
            // [REFACTOR] Cargar licencia al iniciar si hay sesión
            await this.cargarLicenciaUsuario();
        }
        
        // Escuchar cambios en autenticación
        window.pb?.authStore?.onChange(async (token) => {
            if (token) {
                this._ultimaActividad = Date.now();
                if (!this._validandoSesion) {
                    setTimeout(async () => {
                        await this.validarSesionUnica();
                        await this.limpiarSesionesPresas();
                        // [REFACTOR] Recargar licencia al iniciar sesión
                        await this.cargarLicenciaUsuario(true);
                    }, 500);
                }
            } else {
                this.detenerMonitoreoInactividad();
                this.detenerHeartbeat();
                // [REFACTOR] Limpiar licencia al cerrar sesión
                this._licenciaActual = null;
                this.detenerVerificacionPeriodicaLicencia();
            }
        });

        // [REFACTOR] Iniciar verificación periódica de licencia
        this.iniciarVerificacionPeriodicaLicencia();
        
        console.log("[SEGURIDAD] Listo");
    },

    // ======================================================
    // DETECCIÓN DE ACTIVIDAD DEL USUARIO
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
            // [REFACTOR] Asegurar limpieza de licencia
            this._licenciaActual = null;
            this.detenerVerificacionPeriodicaLicencia();
        }
    },

    // ======================================================
    // GESTIÓN DE LICENCIAS (CÓDIGO CONSOLIDADO)
    // ======================================================

    iniciarVerificacionPeriodicaLicencia() {
        if (this._intervaloVerificacionLicencia) clearInterval(this._intervaloVerificacionLicencia);
        this._intervaloVerificacionLicencia = setInterval(() => {
            if (window.pb?.authStore?.isValid) {
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
        if (this._cargandoLicencia && !forzar) {
            console.log("[LICENCIAS] Cargando licencia...");
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

            const licencias = await window.pb.collection('licencias').getFullList({
                filter: `user_id = "${user.id}" && active = true`,
                requestKey: `licencia_${Date.now()}`,
                $autoCancel: false
            }).catch(error => {
                if (error.status === 0) {
                    console.warn("[LICENCIAS] Error de red, usando cache");
                    return this._licenciaActual ? [this._licenciaActual] : [];
                }
                throw error;
            });

            if (licencias && licencias.length > 0) {
                this._licenciaActual = licencias[0];
                console.log("[LICENCIAS] Licencia encontrada:", this._licenciaActual.key);
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
            console.error("[LICENCIAS] Error:", error);
            window.Sistema?.manejarError('cargar_licencia', error, false);
            return null;
        } finally {
            this._cargandoLicencia = false;
        }
    },

    async verificarEstadoLicencia() {
        if (!this._licenciaActual) return false;

        try {
            const licenciaServer = await window.pb.collection('licencias').getOne(
                this._licenciaActual.id,
                { requestKey: `verificar_${Date.now()}`, $autoCancel: false }
            ).catch(error => {
                if (error.status === 0) {
                    console.warn("[LICENCIAS] Error de red en verificación");
                    return this._licenciaActual;
                }
                throw error;
            });

            this._licenciaActual = licenciaServer;

            const hoy = new Date();
            const fechaExpiracion = licenciaServer.expired ? new Date(licenciaServer.expired) : null;
            let expirada = false;

            if (fechaExpiracion && fechaExpiracion < hoy) {
                expirada = true;
                if (licenciaServer.estado === 'activa') {
                    await window.pb.collection('licencias').update(licenciaServer.id, {
                        estado: 'suspendida', active: false
                    }).catch(e => console.warn("[LICENCIAS] Error actualizando licencia:", e));
                    this._licenciaActual.estado = 'suspendida';
                }
            }

            const estado = expirada ? 'suspendida' : (this._licenciaActual.estado || 'activa');
            this.actualizarUILicencia(estado, fechaExpiracion);
            return estado === 'activa';

        } catch (error) {
            console.error("[LICENCIAS] Error verificando:", error);
            if (this._licenciaActual) {
                this.actualizarUILicencia('verificando', null);
            }
            return false;
        }
    },

    // [REFACTOR] Método de UI para actualizar badges de licencia (antes en GestionLicencias)
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
            detalleTexto.textContent = this._licenciaActual 
                ? `Plan ${this._licenciaActual.plan || 'Profesional'} ${fechaExpiracion ? `- Vence: ${fechaExpiracion.toLocaleDateString('es-VE')}` : ''}`
                : 'Sin licencia asignada';
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
    },

    // [REFACTOR] Método de activación de licencia (antes en configuracion.js)
    async activarLicencia(key) {
        try {
            const user = window.pb?.authStore?.model;
            if (!user) throw new Error("Usuario no autenticado");

            const licencias = await window.pb.collection('licencias').getFullList({
                filter: `key = "${key}"`,
                requestKey: `buscar_licencia_${Date.now()}`,
                $autoCancel: false
            });

            if (licencias.length === 0) {
                window.Sistema?.mostrarToast('Clave no válida', 'error');
                return;
            }

            const licencia = licencias[0];

            if (licencia.is_usada) {
                window.Sistema?.mostrarToast('Licencia ya utilizada', 'error');
                return;
            }

            await window.pb.collection('licencias').update(licencia.id, {
                user_id: user.id,
                is_usada: true,
                active: true,
                estado: 'activa',
                fecha_activacion: new Date().toISOString()
            });

            await window.pb.collection('users').update(user.id, { licence_id: licencia.id });

            window.Sistema?.mostrarToast('Licencia activada', 'success');
            await this.cargarLicenciaUsuario(true);

        } catch (error) {
            console.error('Error activando licencia:', error);
            window.Sistema?.mostrarToast('Error al activar', 'error');
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
                $autoCancel: false
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
                if (window.pb?.authStore?.isValid) await this.validarSesionUnica();
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
    // HEARTBEAT MEJORADO
    // ======================================================
    
    iniciarHeartbeat() {
        this.detenerHeartbeat();
        this._heartbeatInterval = setInterval(async () => { await this.ejecutarHeartbeat(); }, SEGURIDAD_CONFIG.HEARTBEAT_INTERVAL);
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
            await window.pb.collection('users').update(window.Sistema.estado.usuario.id, {
                last_seen: new Date().toISOString()
            }, { requestKey: `heartbeat_${Date.now()}`, $autoCancel: false });

            // [REFACTOR] Verificar licencia en el heartbeat
            if (window.pb?.authStore?.isValid) {
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
        if (this._validandoSesion) { console.log("[SEGURIDAD] Ya validando sesión, ignorando..."); return true; }
        this._validandoSesion = true;
        const user = window.pb?.authStore?.model;
        if (!user) { this._validandoSesion = false; return false; }
        const fingerprint = this.generarFingerprint();

        try {
            const serverUser = await window.pb.collection('users').getFirstListItem(`id = "${user.id}"`, {
                requestKey: `validar_${Date.now()}`, $autoCancel: false
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
                requestKey: `limite_${Date.now()}`, $autoCancel: false
            });

            const limite = this.LIMITES[serverUser.user_role] || 2;
            if (activos.totalItems >= limite) {
                await Swal.fire({ icon: 'warning', title: 'Límite Alcanzado', text: `Ya hay ${limite} sesiones activas.` });
                window.pb.authStore.clear();
                this._validandoSesion = false;
                return false;
            }

            await this.registrarSesion(user.id, fingerprint);
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
            session_id: fingerprint, is_online: true, last_seen: new Date().toISOString()
        }, { requestKey: `registro_${Date.now()}`, $autoCancel: false });
    }
};

// Inicializar
if (window.Sistema) {
    AuthSecurity.inicializar();
}

// Exponer configuración y el objeto principal para otros módulos
window.SEGURIDAD_CONFIG = SEGURIDAD_CONFIG;
window.AuthSecurity = AuthSecurity; // [REFACTOR] Exponer globalmente