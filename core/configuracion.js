/**
 * @file configuracion.js
 * @description Configuración del sistema y gestión de usuarios (UI).
 * @version 2.0 - Integrada lógica completa de tasa de cambio
 */

const Configuracion = {
    // ======================================================
    // CONFIGURACIÓN DE TASA (movida desde core.js)
    // ======================================================

    TASA_CONFIG: {
        TASA_TTL: 24 * 60 * 60 * 1000, // 24 horas en milisegundos
        TASA_WARNING_HOURS: 2, // Advertir 2 horas antes de expirar
        TASA_EXPIRADA_HOURS: 24
    },

    STORAGE_KEYS: {
        TASA: 'sisov_tasa_manual',
        TASA_MANUAL_ACTIVA: 'sisov_tasa_manual_activa',
        TASA_TIMESTAMP: 'sisov_tasa_timestamp',
        TASA_REFERENCIA_TIMESTAMP: 'sisov_tasa_referencia_timestamp'
    },

    _abortControllers: new Map(),

    // ======================================================
    // MÉTODOS DE TASA
    // ======================================================

    async cargarTasaBCV() {
        try {
            // PRIMERO: Verificar si hay tasa manual guardada
            const tasaManualGuardada = localStorage.getItem(this.STORAGE_KEYS.TASA);
            const tasaManualActiva = localStorage.getItem(this.STORAGE_KEYS.TASA_MANUAL_ACTIVA) === 'true';
            const tasaTimestamp = localStorage.getItem(this.STORAGE_KEYS.TASA_TIMESTAMP);
            
            if (tasaManualGuardada && tasaManualActiva && tasaTimestamp) {
                // Verificar vigencia
                const vigencia = this.verificarVigenciaTasaManual();
                
                if (vigencia.vigente) {
                    // Restaurar tasa manual vigente
                    window.Sistema.estado.tasaBCV = parseFloat(tasaManualGuardada);
                    window.Sistema.estado.config.tasaManual = true;
                    window.Sistema.estado.config.tasaVigencia = vigencia;
                    
                    console.log("[CONFIG] Tasa manual restaurada (vigente):", window.Sistema.estado.tasaBCV);
                    
                    this.actualizarTasaUI();
                    this.actualizarBadgeTasaManual();
                    
                    // Advertir si está por expirar
                    if (vigencia.horasRestantes <= this.TASA_CONFIG.TASA_WARNING_HOURS && vigencia.horasRestantes > 0) {
                        window.Sistema.mostrarToast(`⚠️ Tu tasa manual expirará en ${vigencia.horasRestantes.toFixed(1)} horas. Considera actualizarla.`, 'warning');
                    }
                    
                    // Actualizar fecha de referencia en el modal si está abierto
                    this.actualizarFechaReferenciaEnModal();
                    
                    return;
                } else {
                    // Tasa manual expirada
                    console.log("[CONFIG] Tasa manual expirada, solicitando actualización");
                    window.Sistema.estado.config.tasaManual = false;
                    localStorage.setItem(this.STORAGE_KEYS.TASA_MANUAL_ACTIVA, 'false');
                }
            }

            // Si no hay tasa manual o está expirada, obtener de API (solo referencia)
            const response = await this.fetchConTimeout(
                'https://api.exchangerate-api.com/v4/latest/USD',
                {},
                15000
            );
            
            const data = await response.json();
            
            if (data.rates?.VES) {
                window.Sistema.estado.tasaBCV = data.rates.VES;
                window.Sistema.estado.config.tasaManual = false;
                
                // Guardar como referencia, pero NO como manual
                localStorage.removeItem(this.STORAGE_KEYS.TASA);
                localStorage.setItem(this.STORAGE_KEYS.TASA_MANUAL_ACTIVA, 'false');
                localStorage.removeItem(this.STORAGE_KEYS.TASA_TIMESTAMP);
                
                // Guardar timestamp de la tasa de referencia
                localStorage.setItem(this.STORAGE_KEYS.TASA_REFERENCIA_TIMESTAMP, Date.now().toString());
                
                console.log("[CONFIG] Tasa de referencia cargada:", window.Sistema.estado.tasaBCV);
            } else {
                throw new Error("No se pudo obtener tasa");
            }
        } catch (error) {
            console.warn("[CONFIG] Error cargando tasa, usando valor por defecto:", error.message);
            window.Sistema.estado.tasaBCV = 36.50;
            window.Sistema.estado.config.tasaManual = false;
            localStorage.removeItem(this.STORAGE_KEYS.TASA);
            localStorage.setItem(this.STORAGE_KEYS.TASA_MANUAL_ACTIVA, 'false');
            localStorage.removeItem(this.STORAGE_KEYS.TASA_TIMESTAMP);
            
            // Guardar timestamp aunque sea valor por defecto
            localStorage.setItem(this.STORAGE_KEYS.TASA_REFERENCIA_TIMESTAMP, Date.now().toString());
        }
        
        this.actualizarTasaUI();
        this.actualizarBadgeTasaManual();
        
        // Actualizar fecha de referencia en el modal si está abierto
        this.actualizarFechaReferenciaEnModal();
    },

    verificarVigenciaTasaManual() {
        const timestamp = localStorage.getItem(this.STORAGE_KEYS.TASA_TIMESTAMP);
        const tasaManualGuardada = localStorage.getItem(this.STORAGE_KEYS.TASA);
        
        // Si no hay timestamp, pero hay tasa manual (compatibilidad hacia atrás)
        if (!timestamp && tasaManualGuardada) {
            // Crear timestamp retroactivo (considerar como recién configurada)
            const nuevoTimestamp = Date.now() - (12 * 60 * 60 * 1000); // Asumir 12h atrás como precaución
            localStorage.setItem(this.STORAGE_KEYS.TASA_TIMESTAMP, nuevoTimestamp.toString());
            return this.verificarVigenciaTasaManual(); // Recursión controlada (solo una vez)
        }
        
        if (!timestamp) {
            return {
                vigente: false,
                motivo: 'sin_timestamp',
                horasTranscurridas: 0,
                horasRestantes: 0,
                expiraEn: null
            };
        }
        
        const tiempoConfiguracion = parseInt(timestamp);
        const tiempoActual = Date.now();
        const tiempoTranscurrido = tiempoActual - tiempoConfiguracion;
        
        const horasTranscurridas = tiempoTranscurrido / (60 * 60 * 1000);
        const horasRestantes = Math.max(0, (this.TASA_CONFIG.TASA_TTL - tiempoTranscurrido) / (60 * 60 * 1000));
        
        const vigente = tiempoTranscurrido < this.TASA_CONFIG.TASA_TTL;
        
        const estado = {
            vigente,
            horasTranscurridas: Math.round(horasTranscurridas * 10) / 10,
            horasRestantes: Math.round(horasRestantes * 10) / 10,
            timestamp,
            tiempoConfiguracion: new Date(tiempoConfiguracion).toLocaleString(),
            expiraEn: vigente ? new Date(tiempoConfiguracion + this.TASA_CONFIG.TASA_TTL).toLocaleString() : null,
            expiradoEn: !vigente ? new Date(tiempoConfiguracion + this.TASA_CONFIG.TASA_TTL).toLocaleString() : null
        };
        
        // Guardar en estado para uso en UI
        window.Sistema.estado.config.tasaVigencia = estado;
        
        return estado;
    },

    tieneTasaManualActiva() {
        if (!window.Sistema.estado.config.tasaManual || window.Sistema.estado.tasaBCV <= 0) return false;
        
        // Verificar vigencia
        const vigencia = this.verificarVigenciaTasaManual();
        return vigencia.vigente;
    },

    async fetchConTimeout(url, options = {}, timeout = 15000) {
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

    actualizarTasaUI() {
        const rateEl = document.getElementById('rateValue');
        if (rateEl) {
            rateEl.textContent = window.Sistema.estado.tasaBCV.toFixed(2);
        }
    },

    actualizarBadgeTasaManual() {
        const tasaContainer = document.querySelector('.cursor-pointer[onclick="Configuracion.mostrarModalTasa()"] .flex');
        if (!tasaContainer) return;
        
        const badgeExistente = document.getElementById('manualRateBadge');
        
        if (window.Sistema.estado.config.tasaManual) {
            const vigencia = this.verificarVigenciaTasaManual();
            
            if (!badgeExistente) {
                const badge = document.createElement('span');
                badge.id = 'manualRateBadge';
                
                if (vigencia.vigente) {
                    badge.className = 'ml-2 text-[8px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full uppercase';
                    badge.textContent = `Manual · ${vigencia.horasRestantes?.toFixed(0) || '24'}h`;
                    badge.title = `Tasa manual vigente por ${vigencia.horasRestantes?.toFixed(1)} horas · Expira: ${vigencia.expiraEn}`;
                } else {
                    badge.className = 'ml-2 text-[8px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full uppercase';
                    badge.textContent = 'Manual · EXPIRADA';
                    badge.title = 'Tasa manual expirada - debe actualizarse';
                }
                
                tasaContainer.appendChild(badge);
            } else {
                // Actualizar badge existente
                if (vigencia.vigente) {
                    badgeExistente.textContent = `Manual · ${vigencia.horasRestantes?.toFixed(0) || '24'}h`;
                    badgeExistente.className = 'ml-2 text-[8px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full uppercase';
                    badgeExistente.title = `Tasa manual vigente por ${vigencia.horasRestantes?.toFixed(1)} horas · Expira: ${vigencia.expiraEn}`;
                } else {
                    badgeExistente.textContent = 'Manual · EXPIRADA';
                    badgeExistente.className = 'ml-2 text-[8px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full uppercase';
                    badgeExistente.title = 'Tasa manual expirada - debe actualizarse';
                }
            }
        } else {
            if (badgeExistente) {
                badgeExistente.remove();
            }
        }
    },

    mostrarModalTasa() {
        const modal = document.getElementById('modalTasa');
        if (modal) {
            // Actualizar el valor de referencia antes de mostrar
            const referenciaElement = document.getElementById('referenciaRate');
            if (referenciaElement) {
                referenciaElement.textContent = window.Sistema.estado.tasaBCV.toFixed(2);
            }
            
            // Actualizar la fecha de la última actualización
            this.actualizarFechaReferenciaEnModal();
            
            // Limpiar el campo de tasa manual
            const inputManual = document.getElementById('tasaManualInput');
            if (inputManual) {
                inputManual.value = '';
            }
            
            modal.classList.add('active');
        }
    },

    cerrarModalTasa() {
        document.getElementById('modalTasa')?.classList.remove('active');
    },

    actualizarFechaReferenciaEnModal() {
        const fechaElement = document.getElementById('referenciaFecha');
        if (!fechaElement) return;
        
        const timestamp = localStorage.getItem(this.STORAGE_KEYS.TASA_REFERENCIA_TIMESTAMP);
        
        if (timestamp) {
            const fecha = new Date(parseInt(timestamp));
            const opciones = {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            };
            fechaElement.textContent = fecha.toLocaleString('es-VE', opciones);
        } else {
            fechaElement.textContent = '--/--/---- --:-- --';
        }
    },

    async obtenerTasaReferencia() {
        try {
            // Mostrar indicador de carga en el botón
            const btnActualizar = document.querySelector('button[onclick="Configuracion.obtenerTasaReferencia()"]');
            const textoOriginal = btnActualizar?.innerHTML;
            if (btnActualizar) {
                btnActualizar.innerHTML = '<i data-lucide="loader" class="w-3 h-3 inline mr-1 animate-spin"></i> Actualizando...';
                btnActualizar.disabled = true;
            }
        
            // Intentar cargar la nueva tasa (PERO NO SOBREESCRIBIR LA MANUAL)
            const response = await this.fetchConTimeout(
                'https://api.exchangerate-api.com/v4/latest/USD',
                {},
                15000
            );
            
            const data = await response.json();
            let nuevaTasaReferencia;
            
            if (data.rates?.VES) {
                nuevaTasaReferencia = data.rates.VES;
            } else {
                throw new Error("No se pudo obtener tasa");
            }
            
            // Guardar timestamp de esta actualización
            localStorage.setItem(this.STORAGE_KEYS.TASA_REFERENCIA_TIMESTAMP, Date.now().toString());
            
            // ACTUALIZAR SOLO EL VALOR VISUAL EN EL MODAL
            const referenciaElement = document.getElementById('referenciaRate');
            if (referenciaElement) {
                referenciaElement.textContent = nuevaTasaReferencia.toFixed(2);
            }
            
            // Actualizar la fecha en el modal
            this.actualizarFechaReferenciaEnModal();
            
            // IMPORTANTE: NO actualizar window.Sistema.estado.tasaBCV si hay tasa manual
            // Solo actualizar el header si NO hay tasa manual
            if (!window.Sistema.estado.config.tasaManual) {
                window.Sistema.estado.tasaBCV = nuevaTasaReferencia;
                this.actualizarTasaUI();
                // Emitir evento si es necesario
                if (window.Sistema.emitirEvento) {
                    window.Sistema.emitirEvento('sisov:tasaUpdated', { tasa: nuevaTasaReferencia, manual: false });
                }
            }
            
            window.Sistema.mostrarToast('Tasa de referencia actualizada', 'success');
            
            // Restaurar el botón
            if (btnActualizar) {
                btnActualizar.innerHTML = textoOriginal;
                btnActualizar.disabled = false;
                if (window.lucide) lucide.createIcons();
            }
            
        } catch (error) {
            console.error('Error:', error);
            window.Sistema.mostrarToast('Error al actualizar tasa', 'error');
            
            // Restaurar el botón en caso de error
            const btnActualizar = document.querySelector('button[onclick="Configuracion.obtenerTasaReferencia()"]');
            if (btnActualizar) {
                btnActualizar.innerHTML = '<i data-lucide="refresh-cw" class="w-3 h-3 inline mr-1"></i> Actualizar';
                btnActualizar.disabled = false;
                if (window.lucide) lucide.createIcons();
            }
        }
    },

    guardarTasaManual() {
        const input = document.getElementById('tasaManualInput');
        const tasa = parseFloat(input?.value);
        
        if (tasa && tasa > 0) {
            const timestamp = Date.now();
            
            // Guardar en estado
            window.Sistema.estado.tasaBCV = tasa;
            window.Sistema.estado.config.tasaManual = true;
            
            // Persistir en localStorage con timestamp
            localStorage.setItem(this.STORAGE_KEYS.TASA, tasa.toString());
            localStorage.setItem(this.STORAGE_KEYS.TASA_MANUAL_ACTIVA, 'true');
            localStorage.setItem(this.STORAGE_KEYS.TASA_TIMESTAMP, timestamp.toString());
            
            // Actualizar vigencia
            this.verificarVigenciaTasaManual();
            
            // Actualizar UI
            this.actualizarTasaUI();
            this.actualizarBadgeTasaManual();
            this.cerrarModalTasa();
            
            // Emitir evento de tasa actualizada
            if (window.Sistema.emitirEvento) {
                window.Sistema.emitirEvento('sisov:tasaUpdated', { tasa, manual: true });
            }
            
            // Forzar recálculo de precios en UI de ventas si está visible
            if (window.Ventas && document.getElementById('tabVentas')?.classList.contains('active')) {
                window.Ventas.renderizarProductos();
                window.Ventas.actualizarCarritoUI();
            }
            
            // Mostrar confirmación con información de vigencia
            const fechaExpiracion = new Date(timestamp + this.TASA_CONFIG.TASA_TTL).toLocaleString();
            window.Sistema.mostrarToast(`✅ Tasa manual configurada por 24h. Expira: ${fechaExpiracion}`, 'success');

            if (input) input.value = '';
        } else {
            window.Sistema.mostrarToast('Ingrese una tasa válida', 'error');
        }
    },

    // ======================================================
    // MÉTODOS ORIGINALES DE CONFIGURACIÓN
    // ======================================================

    async actualizarTasa() {
        const input = document.getElementById('newRate');
        const tasa = parseFloat(input?.value);
        
        if (tasa && tasa > 0) {
            window.Sistema.estado.tasaBCV = tasa;
            window.Sistema.estado.config.tasaManual = true;
            this.actualizarTasaUI();
            window.Sistema.mostrarToast('Tasa actualizada', 'success');
            if (input) input.value = '';
        } else {
            window.Sistema.mostrarToast('Ingrese una tasa válida', 'error');
        }
    },
    
    async abrirModalVendedor() {
        const disponibles = await window.AuthSecurity?.actualizarContadorVendedores() || 0;
        const limite = await window.AuthSecurity?.obtenerLimiteVendedores() || 0;
        const actuales = await window.AuthSecurity?.contarVendedoresActuales() || 0;
        
        if (actuales >= limite) {
            Swal.fire({
                icon: 'error',
                title: 'Límite Alcanzado',
                text: `Has alcanzado el límite de ${limite} vendedores.`,
                confirmButtonText: 'Entendido'
            });
            return;
        }
        
        const { value: datos } = await Swal.fire({
            title: 'Registrar Vendedor',
            html: `
                <div class="space-y-4 text-left">
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Nombres *</label>
                        <input type="text" id="vendedorNombres" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="Ej: Juan Carlos">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Apellidos *</label>
                        <input type="text" id="vendedorApellidos" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="Ej: Rodríguez Pérez">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Cédula *</label>
                        <input type="text" id="vendedorCedula" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="V-12345678">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Teléfono</label>
                        <input type="text" id="vendedorTelefono" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="0412-1234567">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Email *</label>
                        <input type="email" id="vendedorEmail" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="vendedor@email.com">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Contraseña *</label>
                        <input type="password" id="vendedorPassword" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="••••••••">
                    </div>
                    <div class="text-xs text-slate-500">* Campos obligatorios</div>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Registrar',
            cancelButtonText: 'Cancelar',
            width: 600,
            preConfirm: () => {
                const nombres = document.getElementById('vendedorNombres')?.value.trim();
                const apellidos = document.getElementById('vendedorApellidos')?.value.trim();
                const cedula = document.getElementById('vendedorCedula')?.value.trim();
                const telefono = document.getElementById('vendedorTelefono')?.value.trim();
                const email = document.getElementById('vendedorEmail')?.value.trim();
                const password = document.getElementById('vendedorPassword')?.value.trim();
                
                if (!nombres || !apellidos || !cedula || !email || !password) {
                    Swal.showValidationMessage('Complete todos los campos obligatorios');
                    return false;
                }
                
                return { nombres, apellidos, cedula, telefono, email, password };
            }
        });
        
        if (datos) {
            await this.registrarVendedor(datos);
        }
    },
    
    async registrarVendedor(datos) {
        try {
            const admin = window.pb.authStore.model;
            
            const existentes = await window.pb.collection('vendedores').getFullList({
                filter: `email = "${datos.email}"`,
                requestKey: `validar_email_${Date.now()}`,
                $autoCancel: false
            });
            
            if (existentes.length > 0) {
                throw new Error("El email ya está registrado");
            }
            
            const username = datos.email.split('@')[0] + '_' + Math.floor(Math.random() * 1000);
            
            const vendedorData = {
                username: username,
                email: datos.email,
                password: datos.password,
                passwordConfirm: datos.password,
                admin_id: admin.id,
                name: datos.nombres,
                lastname: datos.apellidos,
                cedula: datos.cedula,
                telefono: datos.telefono || '',
                user_role: 'vendedor',
                conectado: false
            };
            
            await window.pb.collection('vendedores').create(vendedorData, {
                requestKey: `crear_vendedor_${Date.now()}`,
                $autoCancel: false
            });
            
            await window.Sistema.registrarLog('VENDEDOR_CREADO', {
                email: datos.email,
                nombre: `${datos.nombres} ${datos.apellidos}`,
                admin_id: admin.id
            });
            
            window.Sistema.mostrarToast('Vendedor registrado', 'success');
            
            await this.cargarUsuarios();
            await window.AuthSecurity?.actualizarContadorVendedores();
            
        } catch (error) {
            console.error('Error:', error);
            window.Sistema.mostrarToast(error.message || 'Error al registrar', 'error');
        }
    },
    
    async cargarUsuarios() {
        try {
            const admin = window.pb.authStore.model;
            if (!admin) return;
            
            const vendedores = await window.pb.collection('vendedores').getFullList({
                filter: `admin_id = "${admin.id}"`,
                sort: '-created',
                requestKey: `usuarios_${Date.now()}`,
                $autoCancel: false
            });
            
            const container = document.getElementById('usersList');
            if (!container) return;
            
            container.innerHTML = '';
            
            const adminDiv = this.crearItemAdmin(admin);
            container.appendChild(adminDiv);
            
            if (vendedores.length === 0) {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'text-center py-4 text-slate-400 text-sm bg-slate-50 rounded-lg mt-2';
                emptyDiv.innerHTML = 'No hay vendedores registrados';
                container.appendChild(emptyDiv);
            } else {
                vendedores.forEach(v => {
                    const userDiv = this.crearItemVendedor(v);
                    container.appendChild(userDiv);
                });
            }
            
            if (window.lucide) lucide.createIcons();
            
        } catch (error) {
            console.error('Error:', error);
            window.Sistema.mostrarToast('Error cargando usuarios', 'error');
        }
    },
    
    crearItemAdmin(admin) {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200';
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-gradient-to-br from-primary to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                    ${admin.user_name?.charAt(0) || admin.email.charAt(0).toUpperCase()}
                </div>
                <div>
                    <h4 class="font-semibold text-slate-800">${admin.user_name || 'Administrador'}</h4>
                    <p class="text-sm text-slate-500">${admin.email}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <span class="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-lg">admin</span>
                <span class="text-xs text-emerald-600">✓</span>
            </div>
        `;
        return div;
    },
    
    crearItemVendedor(v) {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200';
        
        const estado = v.conectado ? '🟢 En línea' : '⚪ Desconectado';
        const estadoColor = v.conectado ? 'text-emerald-600' : 'text-slate-400';
        
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full flex items-center justify-center text-white font-bold">
                    ${v.name?.charAt(0) || 'V'}
                </div>
                <div>
                    <h4 class="font-semibold text-slate-800">${v.name} ${v.lastname || ''}</h4>
                    <p class="text-sm text-slate-500">C.I: ${v.cedula || 'N/A'} | 📞 ${v.telefono || 'N/A'}</p>
                    <p class="text-xs text-slate-400">${v.email}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <span class="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg">vendedor</span>
                <span class="text-xs ${estadoColor}">${estado}</span>
            </div>
        `;
        return div;
    },
    
    async abrirModalRenovacion() {
        const { value: key } = await Swal.fire({
            title: 'Renovar Licencia',
            html: `
                <div class="space-y-4">
                    <p class="text-sm text-slate-600">Ingresa tu nueva clave de licencia</p>
                    <input type="text" id="licenciaKey" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="XXXXX-XXXXX-XXXXX">
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Activar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const key = document.getElementById('licenciaKey')?.value.trim();
                if (!key) {
                    Swal.showValidationMessage('Ingrese una clave');
                    return false;
                }
                return key;
            }
        });
        
        if (key) {
            await window.AuthSecurity?.activarLicencia(key);
        }
    },
    
    copiarLicencia() {
        window.AuthSecurity?.copiarLicenciaAlPortapapeles();
    }
};

// Exponer globalmente
window.Configuracion = Configuracion;
window.copiarLicencia = () => Configuracion.copiarLicencia();