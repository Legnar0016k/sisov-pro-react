/**
 * @file core.js
 * @description Núcleo del sistema con estado transaccional y manejo robusto de errores
 */

// ======================================================
// CONFIGURACIÓN GLOBAL
// ======================================================

const CONFIG = {
    VERSION: "3.5.1",
    TIMEOUTS: {
        OPERACION: 10000,
        RED: 15000,
        TRANSACCION: 20000
    },
    STORAGE_KEYS: {
        TOKEN: 'sisov_token',
        USER: 'sisov_user',
        CARRITO: 'sisov_carrito',
        TASA: 'sisov_tasa_manual'
    },
    EVENTOS: {
        STOCK_ACTUALIZADO: 'sisov:stockUpdated',
        CARRITO_CAMBIADO: 'sisov:cartChanged',
        VENTA_COMPLETADA: 'sisov:saleCompleted',
        ERROR: 'sisov:error'
    }
};

// ======================================================
// SISTEMA PRINCIPAL
// ======================================================

const Sistema = {
    // Estado con validación de tipos
    _estado: {
        usuario: null,
        tasaBCV: 0,
        productos: [],
        carrito: [],
        ventas: [],
        config: {
            tasaManual: false,
            serverTime: null,
            ultimaSincronizacion: null
        },
        transacciones: new Map(), // Para operaciones atómicas
        listeners: new Map() // Para eventos
    },

    // Getters/Setters con validación
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
            // 1. Sincronizar hora del servidor
            await this.actualizarHoraServidor();
            
            // 2. Cargar tasa BCV
            await this.cargarTasaBCV();
            
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
            
            operacion.completar();
            
            console.log("%c[SISTEMA] Inicialización completa", "color: #10b981;");
            
        } catch (error) {
            operacion.fallar(error);
            this.manejarError('inicializacion', error);
            throw error;
        }
    },

    async restaurarSesion() {
        try {
            const token = localStorage.getItem(CONFIG.STORAGE_KEYS.TOKEN);
            const userData = localStorage.getItem(CONFIG.STORAGE_KEYS.USER);
            
            if (token && userData) {
                // Validar token con el servidor
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
            // Intentar obtener el usuario para validar que el token es válido
            const user = await window.pb.collection('users').getOne(userId, {
                requestKey: `validar_${Date.now()}`,
                $autoCancel: false
            });
            
            return !!user;
        } catch {
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
        
        // Timeout automático
        setTimeout(() => {
            if (this._estado.transacciones.has(id) && transaccion.estado === 'pendiente') {
                transaccion.fallar(new Error(`Timeout en transacción ${nombre}`));
            }
        }, timeout);
        
        return transaccion;
    },

    // ======================================================
    // OPERACIONES DE STOCK (NUEVAS - ATÓMICAS)
    // ======================================================

    async ajustarStock(productoId, cantidad, razon = 'ajuste', metadata = {}) {
        const tx = this.iniciarTransaccion(`ajuste_stock_${productoId}`);
        
        try {
            // 1. Validar producto
            const producto = this._estado.productos.find(p => p.id === productoId);
            if (!producto) {
                throw new Error(`Producto ${productoId} no encontrado`);
            }
            
            // 2. Validar stock resultante
            const nuevoStock = producto.stock + cantidad;
            if (nuevoStock < 0) {
                throw new Error(`Stock insuficiente. Actual: ${producto.stock}, solicitado: ${-cantidad}`);
            }
            
            // 3. Realizar actualización atómica en servidor
            const resultado = await window.pb.collection('products').update(productoId, {
                stock: nuevoStock
            }, {
                requestKey: `stock_${Date.now()}_${productoId}`,
                $autoCancel: false
            });
            
            // 4. Actualizar memoria local
            producto.stock = nuevoStock;
            
            // 5. Registrar en log
            await this.registrarLog('AJUSTE_STOCK', {
                producto_id: productoId,
                producto_nombre: producto.name_p,
                cantidad_anterior: producto.stock - cantidad,
                cantidad_nueva: nuevoStock,
                cambio: cantidad,
                razon,
                metadata
            });
            
            // 6. Emitir evento
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
            
            // Procesar en orden para evitar deadlocks
            for (const ajuste of ajustes) {
                try {
                    const resultado = await this.ajustarStock(
                        ajuste.productoId, 
                        ajuste.cantidad, 
                        razon,
                        ajuste.metadata
                    );
                    resultados.push(resultado);
                } catch (error) {
                    errores.push({
                        productoId: ajuste.productoId,
                        error: error.message
                    });
                    
                    // Si hay error crítico, revertir cambios anteriores
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
            // Revertir cambios si es necesario
            await this.revertirAjustes(resultados, razon);
            tx.fallar(error);
            throw error;
        }
    },

    async revertirAjustes(ajustesRealizados, razon) {
        console.warn("[STOCK] Revirtiendo ajustes...");
        
        for (const ajuste of ajustesRealizados.reverse()) {
            try {
                await this.ajustarStock(
                    ajuste.id,
                    -ajuste.cambio,
                    `reversion_${razon}`
                );
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
        
        // Retornar función para remover
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
            
            // Guardar en localStorage como backup
            this.guardarLogLocal(logEntry);
            
            // Intentar guardar en servidor (no bloquear)
            if (window.pb) {
                window.pb.collection('system_logs').create(logEntry).catch(e => {
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
            
            // Mantener solo últimos 100 logs
            if (logs.length > 100) {
                logs.shift();
            }
            
            localStorage.setItem('sisov_logs', JSON.stringify(logs));
        } catch (error) {
            // Ignorar errores de localStorage
        }
    },

    manejarError(contexto, error, mostrarAlUsuario = true) {
        const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        
        console.error(`[ERROR:${errorId}] ${contexto}:`, error);
        
        // Registrar error
        this.registrarLog('ERROR', {
            error_id: errorId,
            contexto,
            mensaje: error.message,
            stack: error.stack,
            estado: {
                usuario: this._estado.usuario?.email,
                url: window.location.href,
                timestamp: new Date().toISOString()
            }
        });
        
        // Emitir evento de error
        this.emitirEvento(CONFIG.EVENTOS.ERROR, {
            errorId,
            contexto,
            mensaje: error.message
        });
        
        // Mostrar al usuario si es necesario
        if (mostrarAlUsuario) {
            this.mostrarToast(error.message, 'error');
        }
        
        return errorId;
    },

    // ======================================================
    // SEGURIDAD Y HEARTBEAT
    // ======================================================

    iniciarHeartbeat() {
        setInterval(async () => {
            if (this._estado.usuario) {
                try {
                    // Verificar sesión activa
                    const user = await window.pb.collection('users').getOne(this._estado.usuario.id, {
                        requestKey: `heartbeat_${Date.now()}`,
                        $autoCancel: false
                    });
                    
                    if (!user) {
                        console.warn("[HEARTBEAT] Usuario no encontrado, cerrando sesión");
                        this.cerrarSesionForzada();
                    }
                    
                    // Verificar licencia si existe
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
        }, 60000); // Cada minuto
    },

    cerrarSesionForzada() {
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
        const toast = document.createElement('div');
        toast.className = `toast toast-${tipo}`;
        toast.innerHTML = `
            <div class="flex items-center gap-2">
                ${this.getIconoToast(tipo)}
                <span>${mensaje}</span>
            </div>
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
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
    // MÉTODOS EXISTENTES (ADAPTADOS)
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
            // Cargar productos
            if (window.Inventario) {
                await window.Inventario.cargarProductos();
            }
            
            // Cargar carrito persistente
            if (window.Ventas) {
                window.Ventas.cargarCarritoPersistente();
            }
            
            // Cargar licencia
            if (window.GestionLicencias) {
                await window.GestionLicencias.cargarLicenciaUsuario();
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

    async cargarTasaBCV() {
        try {
            const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
                timeout: 5000
            });
            const data = await response.json();
            
            if (data.rates?.VES) {
                this._estado.tasaBCV = data.rates.VES;
            } else {
                throw new Error("No se pudo obtener tasa");
            }
        } catch {
            console.warn("[SISTEMA] Usando tasa por defecto");
            this._estado.tasaBCV = 36.50;
        }
        
        this.actualizarTasaUI();
    },

    async actualizarHoraServidor() {
        try {
            const response = await fetch('https://web-production-81e05.up.railway.app/hora-venezuela', {
                timeout: 5000
            });
            const data = await response.json();
            
            if (data.ok && data.iso) {
                this._estado.config.serverTime = new Date(data.iso.replace('Z', ''));
                this._estado.config.ultimaSincronizacion = Date.now();
                this.iniciarRelojVisual(data.iso);
            } else {
                throw new Error("Respuesta inválida");
            }
        } catch (error) {
            console.warn("[SISTEMA] Usando hora local:", error);
            this._estado.config.serverTime = new Date();
            this._estado.config.ultimaSincronizacion = Date.now();
        }
    },

    iniciarRelojVisual(horaInicial) {
        let tiempo = new Date(horaInicial.replace('Z', ''));
        
        // Limpiar intervalo anterior si existe
        if (this._intervaloReloj) {
            clearInterval(this._intervaloReloj);
        }
        
        this._intervaloReloj = setInterval(() => {
            tiempo.setSeconds(tiempo.getSeconds() + 1);
            
            if (window.TimeModule) {
                window.TimeModule.actualizarUI(tiempo);
            } else {
                this.actualizarRelojLocal(tiempo);
            }
        }, 1000);
    },

    actualizarRelojLocal(tiempo) {
        const h = tiempo.getHours();
        const m = String(tiempo.getMinutes()).padStart(2, '0');
        const s = String(tiempo.getSeconds()).padStart(2, '0');
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        
        document.getElementById('headerClock').textContent = `${h12}:${m}:${s}`;
        document.getElementById('clockPeriod').textContent = ampm;
        document.getElementById('headerDate').textContent = 
            `${String(tiempo.getDate()).padStart(2, '0')}/${String(tiempo.getMonth() + 1).padStart(2, '0')}/${tiempo.getFullYear()}`;
    },

    actualizarTasaUI() {
        const rateEl = document.getElementById('rateValue');
        if (rateEl) {
            rateEl.textContent = this._estado.tasaBCV.toFixed(2);
        }
    },

    cambiarTab(tabId) {
        // Desactivar todos los tabs
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.remove('border-primary', 'text-primary');
            b.classList.add('border-transparent', 'text-slate-600');
        });

        // Activar tab seleccionado
        const tab = document.getElementById(`tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
        if (tab) tab.classList.add('active');

        const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if (btn) btn.classList.add('border-primary', 'text-primary');

        // Acciones específicas por tab
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
                if (window.GestionLicencias) {
                    window.GestionLicencias.actualizarContadorVendedores();
                }
                if (window.Configuracion) {
                    window.Configuracion.cargarUsuarios();
                }
                break;
        }
    },

    // Utilidades
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
        // Login form
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
        
        // Búsqueda en productos
        const searchInput = document.getElementById('searchProducts');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                if (window.Ventas) {
                    window.Ventas.buscarProductos(e.target.value);
                }
            });
        }
    },

    activarVentasManual(elemento) {
        this.cambiarTab('ventas');
        elemento.classList.remove('tab-atencion');
    }
};

// Exponer globalmente
window.Sistema = Sistema;
window.CONFIG = CONFIG;