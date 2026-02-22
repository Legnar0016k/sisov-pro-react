/**
 * @file core.js
 * @description Núcleo del sistema con estado transaccional y manejo robusto de errores
 * @version 4.0.0 - Versión limpia, tasas y tiempo movidos a módulos específicos
 */

// ======================================================
// CONFIGURACIÓN GLOBAL
// ======================================================

const CONFIG = {
    VERSION: "4.0.0",
    TIMEOUTS: {
        OPERACION: 10000,
        RED: 15000,
        TRANSACCION: 20000
    },
    STORAGE_KEYS: {
        TOKEN: 'sisov_token',
        USER: 'sisov_user',
        CARRITO: 'sisov_carrito'
    },
    EVENTOS: {
        STOCK_ACTUALIZADO: 'sisov:stockUpdated',
        CARRITO_CAMBIADO: 'sisov:cartChanged',
        VENTA_COMPLETADA: 'sisov:saleCompleted',
        ERROR: 'sisov:error',
        TASA_ACTUALIZADA: 'sisov:tasaUpdated'
    }
};

// Exponer CONFIG globalmente para otros módulos
window.CONFIG = CONFIG;

// ======================================================
// SISTEMA PRINCIPAL
// ======================================================

const Sistema = {
    // Estado con validación de tipos
    _estado: {
        usuario: null,
        tasaBCV: 0, // Solo almacena, la lógica está en Configuracion
        productos: [],
        carrito: [],
        ventas: [],
        config: {
            tasaManual: false,
            serverTime: null, // Solo almacena, la lógica está en TimeModule
            ultimaSincronizacion: null,
            tasaVigencia: null // Solo almacena, la lógica está en Configuracion
        },
        transacciones: new Map(),
        listeners: new Map()
    },

    _abortControllers: new Map(),

    get estado() {
        return this._estado;
    },

    set estado(nuevoEstado) {
        console.error("[SISTEMA] No se puede reemplazar el estado directamente");
    },

    // ======================================================
    // INICIALIZACIÓN
    // ======================================================

    async inicializar() {
        console.log(`[SISTEMA] Iniciando v${CONFIG.VERSION}...`);
        
        const operacion = this.iniciarTransaccion('inicializacion');
        
        try {
            // 1. Sincronizar hora del servidor (delegado a TimeModule)
            if (window.TimeModule) {
                await window.TimeModule.sincronizarHoraServidor();
                this._estado.config.serverTime = window.TimeModule._horaActual;
                this._estado.config.ultimaSincronizacion = Date.now();
            }
            
            // 2. Cargar tasa BCV (delegado a Configuracion)
            if (window.Configuracion) {
                await window.Configuracion.cargarTasaBCV();
            }
            
            // 3. Restaurar sesión si existe
            await this.restaurarSesion();
            
            // 4. Configurar listeners de eventos
            this.configurarEventosGlobales();
            
            // 5. Iniciar heartbeat de seguridad
            this.iniciarHeartbeat();
            
            // 6. Si hay usuario, cargar datos iniciales
            if (this._estado.usuario) {
                await this.cargarDatosIniciales();
            }

            // Restaurar la última pestaña activa
            if (window.Configuracion && window.Configuracion.restaurarPestanaActiva) {
                window.Configuracion.restaurarPestanaActiva();
            }
            
            operacion.completar();
            
            console.log("%c[SISTEMA] Inicialización completa", "color: #10b981;");
            
        } catch (error) {
            operacion.fallar(error);
            this.manejarError('inicializacion', error);
            throw error;
        }
    },

    // ======================================================
    // FETCH CON TIMEOUT (se mantiene para uso interno)
    // ======================================================

    async fetchConTimeout(url, options = {}, timeout = CONFIG.TIMEOUTS.RED) {
        const controller = new AbortController();
        const id = `fetch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        this._abortControllers.set(id, controller);
        
        const timeoutId = setTimeout(() => {
            controller.abort();
            this._abortControllers.delete(id);
        }, timeout);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            this._abortControllers.delete(id);
            
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            this._abortControllers.delete(id);
            
            if (error.name === 'AbortError') {
                throw new Error(`Timeout de ${timeout}ms excedido para ${url}`);
            }
            throw error;
        }
    },

    cancelarPeticionesPendientes() {
        this._abortControllers.forEach((controller, id) => {
            controller.abort();
        });
        this._abortControllers.clear();
        console.log("[SISTEMA] Peticiones pendientes canceladas");
    },

    // ======================================================
    // RESTAURAR SESIÓN
    // ======================================================

    async restaurarSesion() {
        try {
            const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
            const userData = localStorage.getItem(CONFIG.STORAGE_KEYS.USER);
            
            if (token && userData) {
                const usuario = JSON.parse(userData);
                const valido = await this.validarTokenServidor(token, usuario.id);
                
                if (valido) {
                    this._estado.usuario = usuario;
                    document.getElementById('loginView')?.classList.add('hidden');
                    document.getElementById('mainView')?.classList.remove('hidden');
                    this.actualizarUIUsuario();
                    return true;
                }
            }
            
            this.mostrarVistaLogin();
            return false;
            
        } catch (error) {
            console.error("[SISTEMA] Error restaurando sesión:", error);
            this.limpiarSesionLocal();
            this.mostrarVistaLogin();
            return false;
        }
    },

    async validarTokenServidor(token, userId) {
        try {
            const user = await window.pb.collection('users').getFirstListItem(`id = "${userId}"`, {
                requestKey: `validar_${Date.now()}`,
                $autoCancel: false
            });
            return !!user;
        } catch (error) {
            console.warn("[SISTEMA] Error validando token:", error.message);
            return false;
        }
    },

    // ======================================================
    // SISTEMA TRANSACCIONAL
    // ======================================================

    iniciarTransaccion(nombre, timeout = CONFIG.TIMEOUTS.TRANSACCION) {
        const id = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const transaccion = {
            id,
            nombre,
            inicio: Date.now(),
            timeout,
            estado: 'pendiente',
            datos: {},
            completar: () => {
                transaccion.estado = 'completada';
                this._estado.transacciones.delete(id);
                console.log(`[TRANSACCION] ${nombre} completada [${id}]`);
            },
            fallar: (error) => {
                transaccion.estado = 'fallida';
                transaccion.error = error;
                this._estado.transacciones.delete(id);
                console.error(`[TRANSACCION] ${nombre} falló:`, error);
            }
        };
        
        this._estado.transacciones.set(id, transaccion);
        
        setTimeout(() => {
            if (this._estado.transacciones.has(id) && transaccion.estado === 'pendiente') {
                transaccion.fallar(new Error(`Timeout en transacción ${nombre}`));
            }
        }, timeout);
        
        return transaccion;
    },

    // ======================================================
    // OPERACIONES DE STOCK (ATÓMICAS)
    // ======================================================

    async ajustarStock(productoId, cantidad, razon = 'ajuste', metadata = {}) {
        const tx = this.iniciarTransaccion(`ajuste_stock_${productoId}`);
        
        try {
            const producto = this._estado.productos.find(p => p.id === productoId);
            if (!producto) {
                throw new Error(`Producto ${productoId} no encontrado`);
            }
            
            const nuevoStock = producto.stock + cantidad;
            if (nuevoStock < 0) {
                throw new Error(`Stock insuficiente. Actual: ${producto.stock}, solicitado: ${-cantidad}`);
            }
            
            const resultado = await window.pb.collection('products').update(productoId, {
                stock: nuevoStock
            }, {
                requestKey: `stock_${Date.now()}_${productoId}`,
                $autoCancel: false
            });
            
            producto.stock = nuevoStock;
            
            await this.registrarLog('AJUSTE_STOCK', {
                producto_id: productoId,
                producto_nombre: producto.name_p,
                cantidad_anterior: producto.stock - cantidad,
                cantidad_nueva: nuevoStock,
                cambio: cantidad,
                razon,
                metadata
            });
            
            this.emitirEvento(CONFIG.EVENTOS.STOCK_ACTUALIZADO, {
                productoId,
                stockAnterior: producto.stock - cantidad,
                stockNuevo: nuevoStock,
                cambio: cantidad
            });
            
            tx.completar();
            return resultado;
            
        } catch (error) {
            tx.fallar(error);
            throw error;
        }
    },

    async ajusteStockMultiple(ajustes, razon = 'ajuste_multiple') {
        const tx = this.iniciarTransaccion('ajuste_multiple', CONFIG.TIMEOUTS.TRANSACCION * 2);
        
        try {
            const resultados = [];
            const errores = [];
            
            for (const ajuste of ajustes) {
                try {
                    const resultado = await this.ajustarStock(
                        ajuste.productoId, 
                        ajuste.cantidad, 
                        razon,
                        ajuste.metadata || {}
                    );
                    resultados.push(resultado);
                } catch (error) {
                    errores.push({
                        productoId: ajuste.productoId,
                        error: error.message
                    });
                    
                    if (ajuste.critical) {
                        throw new Error(`Error crítico en ${ajuste.productoId}: ${error.message}`);
                    }
                }
            }
            
            tx.completar();
            
            if (errores.length > 0) {
                console.warn("[STOCK] Algunos ajustes fallaron:", errores);
            }
            
            return { resultados, errores };
            
        } catch (error) {
            await this.revertirAjustes(resultados || [], razon);
            tx.fallar(error);
            throw error;
        }
    },

    async revertirAjustes(ajustesRealizados, razon) {
        console.warn("[STOCK] Revirtiendo ajustes...");
        
        for (const ajuste of ajustesRealizados.reverse()) {
            try {
                const productoId = ajuste.id || ajuste.productoId;
                const cambio = ajuste.cambio || 0;
                
                if (productoId && cambio !== 0) {
                    await this.ajustarStock(
                        productoId,
                        -cambio,
                        `reversion_${razon}`
                    ).catch(e => console.error("[STOCK] Error en reversión:", e));
                }
            } catch (error) {
                console.error("[STOCK] Error en reversión:", error);
            }
        }
    },

    // ======================================================
    // SISTEMA DE EVENTOS
    // ======================================================

    on(evento, callback) {
        if (!this._estado.listeners.has(evento)) {
            this._estado.listeners.set(evento, new Set());
        }
        this._estado.listeners.get(evento).add(callback);
        
        return () => this.off(evento, callback);
    },

    off(evento, callback) {
        if (this._estado.listeners.has(evento)) {
            this._estado.listeners.get(evento).delete(callback);
        }
    },

    emitirEvento(evento, datos) {
        if (this._estado.listeners.has(evento)) {
            this._estado.listeners.get(evento).forEach(callback => {
                try {
                    callback(datos);
                } catch (error) {
                    console.error(`[EVENTOS] Error en callback de ${evento}:`, error);
                }
            });
        }
    },

    // ======================================================
    // LOGGING Y ERRORES
    // ======================================================

    async registrarLog(tipo, datos) {
        try {
            const logEntry = {
                type: tipo,
                timestamp: new Date().toISOString(),
                user: this._estado.usuario?.email || 'sistema',
                user_id: this._estado.usuario?.id || null,
                data: datos,
                session_id: this._estado.usuario?.session_id || null
            };
            
            this.guardarLogLocal(logEntry);
            
            if (window.pb) {
                window.pb.collection('system_logs').create(logEntry, {
                    $autoCancel: false,
                    requestKey: `log_${Date.now()}`
                }).catch(e => {
                    console.warn("[LOGS] No se pudo guardar en servidor:", e);
                });
            }
            
        } catch (error) {
            console.warn("[LOGS] Error guardando log:", error);
        }
    },

    guardarLogLocal(logEntry) {
        try {
            const logs = JSON.parse(localStorage.getItem('sisov_logs') || '[]');
            logs.push(logEntry);
            
            if (logs.length > 100) {
                logs.shift();
            }
            
            localStorage.setItem('sisov_logs', JSON.stringify(logs));
        } catch (error) {}
    },

    manejarError(contexto, error, mostrarAlUsuario = true) {
        const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        
        console.error(`[ERROR:${errorId}] ${contexto}:`, error);
        
        this.registrarLog('ERROR', {
            error_id: errorId,
            contexto,
            mensaje: error.message || 'Error desconocido',
            stack: error.stack,
            estado: {
                usuario: this._estado.usuario?.email,
                url: window.location.href,
                timestamp: new Date().toISOString()
            }
        });
        
        this.emitirEvento(CONFIG.EVENTOS.ERROR, {
            errorId,
            contexto,
            mensaje: error.message || 'Error desconocido'
        });
        
        if (mostrarAlUsuario) {
            this.mostrarToast(error.message || 'Error inesperado', 'error');
        }
        
        return errorId;
    },

    // ======================================================
    // SEGURIDAD Y HEARTBEAT
    // ======================================================

    iniciarHeartbeat() {
        this._heartbeatInterval = setInterval(async () => {
            if (this._estado.usuario) {
                try {
                    const user = await window.pb.collection('users').getOne(this._estado.usuario.id, {
                        requestKey: `heartbeat_${Date.now()}`,
                        $autoCancel: false
                    }).catch(e => {
                        if (e.status === 401 || e.status === 403) {
                            throw e;
                        }
                        return null;
                    });
                    
                    if (!user) {
                        console.warn("[HEARTBEAT] Usuario no encontrado, cerrando sesión");
                        this.cerrarSesionForzada();
                    }
                    
                    if (window.GestionLicencias) {
                        await window.GestionLicencias.verificarEstadoLicencia();
                    }
                    
                } catch (error) {
                    if (error.status === 401 || error.status === 403) {
                        console.warn("[HEARTBEAT] Sesión inválida, cerrando");
                        this.cerrarSesionForzada();
                    }
                }
            }
        }, 60000);
    },

    cerrarSesionForzada() {
        this.cancelarPeticionesPendientes();
        
        if (this._heartbeatInterval) {
            clearInterval(this._heartbeatInterval);
        }
        
        this.limpiarSesionLocal();
        this.mostrarVistaLogin();
        this.mostrarToast('Sesión expirada', 'warning');
    },

    limpiarSesionLocal() {
        localStorage.removeItem(CONFIG.STORAGE_KEYS.TOKEN);
        localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
        this._estado.usuario = null;
    },

    // ======================================================
    // MÉTODOS DE UI
    // ======================================================

    mostrarToast(mensaje, tipo = 'info') {
        const mensajeSanitizado = this.sanitizarTexto(mensaje);
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${tipo}`;
        
        const icono = this.getIconoToast(tipo);
        
        toast.innerHTML = `<div class="flex items-center gap-2">${icono}</div>`;
        
        const spanMensaje = document.createElement('span');
        spanMensaje.textContent = mensajeSanitizado;
        toast.querySelector('.flex.items-center').appendChild(spanMensaje);
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    cerrarInfoMessage() {
        const infoMessage = document.getElementById('infoMessage');
        if (infoMessage) {
            infoMessage.innerHTML = '';
            infoMessage.className = 'mb-6 hidden';
            infoMessage.dataset.closed = 'true';
            
            setTimeout(() => {
                delete infoMessage.dataset.closed;
                this.verificarBloqueoPorTasa();
            }, 60 * 60 * 1000);
        }
    },

    sanitizarTexto(texto) {
        if (!texto) return '';
        return String(texto)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    getIconoToast(tipo) {
        const iconos = {
            success: '<i data-lucide="check-circle" class="w-5 h-5"></i>',
            error: '<i data-lucide="alert-circle" class="w-5 h-5"></i>',
            warning: '<i data-lucide="alert-triangle" class="w-5 h-5"></i>',
            info: '<i data-lucide="info" class="w-5 h-5"></i>'
        };
        return iconos[tipo] || iconos.info;
    },

    mostrarVistaLogin() {
        document.getElementById('loginView')?.classList.remove('hidden');
        document.getElementById('mainView')?.classList.add('hidden');
    },

    actualizarUIUsuario() {
        if (this._estado.usuario) {
            const userName = document.getElementById('userName');
            const userRole = document.getElementById('userRole');
            
            if (userName) userName.textContent = this._estado.usuario.nombre;
            if (userRole) userRole.textContent = this._estado.usuario.rol?.toUpperCase() || 'USUARIO';
        }
    },

    // ======================================================
    // MÉTODOS DE AUTENTICACIÓN
    // ======================================================

    async iniciarSesion(email, password) {
        const tx = this.iniciarTransaccion('login');
        
        try {
            const authData = await window.pb.collection('users').authWithPassword(email, password);
            
            if (authData?.token) {
                this._estado.usuario = {
                    id: authData.record.id,
                    email: authData.record.email,
                    nombre: authData.record.user_name || email.split('@')[0],
                    rol: authData.record.user_role || 'user',
                    session_id: authData.record.session_id
                };
                
                localStorage.setItem(CONFIG.STORAGE_KEYS.TOKEN, authData.token);
                localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(this._estado.usuario));
                
                await this.cargarDatosIniciales();
                
                this.mostrarVistaPrincipal();
                this.mostrarToast('Sesión iniciada', 'success');
                
                tx.completar();
                return true;
            }
            
            throw new Error("Credenciales inválidas");
            
        } catch (error) {
            tx.fallar(error);
            this.manejarError('login', error);
            return false;
        }
    },

    async cargarDatosIniciales() {
        try {
            if (window.Inventario) {
                await window.Inventario.cargarProductos();
            }

            if (window.Ventas) {
                window.Ventas.cargarCarritoPersistente();
            }

            if (window.AuthSecurity) {
                await window.AuthSecurity.cargarLicenciaUsuario();
            }

            // Verificar tasa manual y bloquear si es necesario (delegado)
            if (window.Configuracion && window.Configuracion.tieneTasaManualActiva) {
                this.verificarBloqueoPorTasa();
            }

        } catch (error) {
            this.manejarError('carga_datos_iniciales', error, false);
        }
    },

    mostrarVistaPrincipal() {
        document.getElementById('loginView')?.classList.add('hidden');
        document.getElementById('mainView')?.classList.remove('hidden');
        this.actualizarUIUsuario();
        this.cambiarTab('ventas');
    },

    async cerrarSesion() {
        const result = await Swal.fire({
            title: '¿Cerrar sesión?',
            text: 'Se cerrará tu sesión actual',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Cerrar',
            cancelButtonText: 'Cancelar'
        });
        
        if (result.isConfirmed) {
            try {
                this.cancelarPeticionesPendientes();
                
                if (this._heartbeatInterval) {
                    clearInterval(this._heartbeatInterval);
                }
                
                if (this._estado.usuario) {
                    await window.pb.collection('users').update(this._estado.usuario.id, {
                        session_id: "",
                        is_online: false
                    }).catch(e => console.warn("[LOGOUT] Error actualizando estado:", e));
                }
            } finally {
                this.limpiarSesionLocal();
                if (window.pb) window.pb.authStore.clear();
                
                this._estado.usuario = null;
                this._estado.carrito = [];
                this._estado.productos = [];
                
                this.mostrarVistaLogin();
                this.mostrarToast('Sesión cerrada', 'info');
                
                setTimeout(() => window.location.reload(), 1000);
            }
        }
    },

    // ======================================================
    // MÉTODOS DE TASA (AHORA DELEGADOS)
    // ======================================================

    tieneTasaManualActiva() {
        return window.Configuracion?.tieneTasaManualActiva?.() || false;
    },

    verificarBloqueoPorTasa() {
        const tieneTasa = this.tieneTasaManualActiva();
        
        const btnProcesar = document.getElementById('btnProcesarVenta');
        if (btnProcesar) {
            if (!tieneTasa) {
                btnProcesar.disabled = true;
                btnProcesar.title = window.Sistema.estado.config.tasaManual ? 'Tasa manual expirada' : 'Debes configurar una tasa manual primero';
                btnProcesar.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                btnProcesar.disabled = false;
                btnProcesar.title = '';
                btnProcesar.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }
        
        const btnNuevoProducto = document.querySelector('button[onclick="Inventario.mostrarModalProducto()"]');
        if (btnNuevoProducto) {
            if (!tieneTasa) {
                btnNuevoProducto.disabled = true;
                btnNuevoProducto.title = window.Sistema.estado.config.tasaManual ? 'Tasa manual expirada' : 'Configura una tasa manual primero';
                btnNuevoProducto.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                btnNuevoProducto.disabled = false;
                btnNuevoProducto.title = '';
                btnNuevoProducto.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }
        
        const infoMessage = document.getElementById('infoMessage');
        if (infoMessage && !infoMessage.dataset.closed) {
            this.actualizarMensajeTasa(tieneTasa);
        }
    },

    actualizarMensajeTasa(tieneTasa) {
        const infoMessage = document.getElementById('infoMessage');
        if (!infoMessage) return;
        
        if (infoMessage.dataset.custom && infoMessage.dataset.custom !== 'tasa') {
            return;
        }
        
        if (!tieneTasa) {
            const tasaManualGuardada = localStorage.getItem('sisov_tasa_manual');
            const tasaActiva = localStorage.getItem('sisov_tasa_manual_activa') === 'true';
            
            if (tasaManualGuardada && tasaActiva) {
                const vigencia = window.Configuracion?.verificarVigenciaTasaManual?.();
                if (vigencia && !vigencia.vigente) {
                    infoMessage.innerHTML = `
                        <i data-lucide="clock" class="text-red-600 w-5 h-5"></i>
                        <p class="text-red-800 text-sm font-medium flex-1">
                            <span class="font-bold">⏰ TASA EXPIRADA:</span> La tasa manual ha superado las 24h de vigencia.
                        </p>
                        <button onclick="Sistema.cerrarInfoMessage()" class="text-red-400 hover:text-red-600">
                            <i data-lucide="x" class="w-4 h-4"></i>
                        </button>
                    `;
                    infoMessage.className = 'mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl flex items-center gap-3';
                    infoMessage.dataset.custom = 'tasa';
                    if (window.lucide) lucide.createIcons();
                    return;
                }
            }
            
            infoMessage.innerHTML = `
                <i data-lucide="alert-triangle" class="text-amber-600 w-5 h-5"></i>
                <p class="text-amber-800 text-sm font-medium flex-1">
                    <span class="font-bold">⚡ ATENCIÓN:</span> Debes configurar una tasa manual cada 24 horas para de poder realizar ventas 
                    [pulsa el boton verde para configurar la TASA BCV y desbloquear el sistema de ventas].
                </p>
                <button onclick="Sistema.cerrarInfoMessage()" class="text-amber-400 hover:text-amber-600">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            `;
            infoMessage.className = 'mb-6 p-4 bg-amber-50 border-l-4 border-amber-500 rounded-r-xl flex items-center gap-3';
            infoMessage.dataset.custom = 'tasa';
        } else {
            infoMessage.innerHTML = `
                <i data-lucide="info" class="text-blue-600 w-5 h-5"></i>
                <p class="text-blue-800 text-sm font-medium flex-1">
                    <span class="font-bold">Nota:</span> Si no visualizas los productos, presiona cualquier pestaña del menú superior para refrescar.
                </p>
                <button onclick="Sistema.cerrarInfoMessage()" class="text-blue-400 hover:text-blue-600">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            `;
            infoMessage.className = 'mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-xl flex items-center gap-3';
            delete infoMessage.dataset.custom;
        }
        
        if (window.lucide) lucide.createIcons();
    },

    // ======================================================
    // NAVEGACIÓN ENTRE TABS
    // ======================================================

    cambiarTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('border-primary', 'text-primary');
            b.classList.add('border-transparent', 'text-slate-600');
        });

        const tab = document.getElementById(`tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
        if (tab) tab.classList.add('active');

        const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if (btn) btn.classList.add('border-primary', 'text-primary');

        switch(tabId) {
            case 'ventas':
                if (window.Ventas) {
                    window.Ventas.renderizarProductos();
                    window.Ventas.actualizarCarritoUI();
                }
                break;
            case 'inventario':
                if (window.Inventario) window.Inventario.renderizarInventario();
                break;
            case 'reportes':
                if (window.Reportes) window.Reportes.cargarReportes();
                break;
            case 'configuracion':
                if (window.AuthSecurity) {
                    window.AuthSecurity.actualizarContadorVendedores();
                }
                if (window.Configuracion) {
                    window.Configuracion.cargarUsuarios();
                }
                break;
        }
    },

    formatearMoneda(monto, moneda = 'USD') {
        if (moneda === 'USD') {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2
            }).format(monto);
        } else {
            return new Intl.NumberFormat('es-VE', {
                style: 'currency',
                currency: 'VES',
                minimumFractionDigits: 2
            }).format(monto).replace('VES', 'Bs');
        }
    },

    configurarEventosGlobales() {
        document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btn = document.getElementById('loginBtn');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader" class="w-5 h-5 animate-spin"></i> CARGANDO...';
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            await this.iniciarSesion(email, password);
            
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="log-in"></i> INICIAR SESIÓN';
            if (window.lucide) lucide.createIcons();
        });
        
        const searchInput = document.getElementById('searchProducts');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                if (window.Ventas) {
                    window.Ventas.buscarProductos(e.target.value);
                }
            });
        }

        this.on(CONFIG.EVENTOS.TASA_ACTUALIZADA, () => {
            if (window.Ventas && document.getElementById('tabVentas')?.classList.contains('active')) {
                window.Ventas.renderizarProductos();
                window.Ventas.actualizarCarritoUI();
            }
        });
    },

    activarVentasManual(elemento) {
        this.cambiarTab('ventas');
        elemento.classList.remove('tab-atencion');
    }
};

// Exponer globalmente
window.Sistema = Sistema;

// Líneas de código: 1430 (versión 3.4.4 - 21/02/2026)
// Líneas de código: 909 (versión 3.5.4 - 21/02/2026) se tranfiere parte del codigo a time-module.js y cnfiguracion para mejorar la organización y delegar responsabilidades