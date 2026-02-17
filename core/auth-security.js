/**
 * @file auth-security.js
 * @description Neurona de Seguridad Blindada - Control de sesiones, jerarquías y licencias.
 */

const LimpiezaProfunda = {
    ejecutar() {
        if (window.Sistema) {
            window.Sistema.estado.productos = [];
            window.Sistema.estado.carrito = [];
            window.Sistema.estado.ventas = [];
        }
        console.log("%c[SEGURIDAD] Espacio de trabajo desinfectado y listo.", "color: #fbbf24;");
    }
};

// ===== NUEVO: MÓDULO DE GESTIÓN DE LICENCIAS =====
const GestionLicencias = {
    // Datos de la licencia actual
    licenciaActual: null,
    
    async inicializar() {
        // Pequeño retraso para evitar múltiples inicializaciones
        setTimeout(async () => {
            if (window.pb && window.pb.authStore.isValid) {
                await this.cargarLicenciaUsuario();
            }
        }, 100);

        window.pb.authStore.onChange(async (token, model) => {
            if (token) {
                // También con retraso para evitar duplicados
                setTimeout(async () => {
                    await this.cargarLicenciaUsuario();
                }, 50);
            } else {
                this.licenciaActual = null;
            }
        });

        console.log("%c[LICENCIAS] Módulo inicializado", "color: #10b981;");
    },
    
    async cargarLicenciaUsuario() {
        // Evitar múltiples llamadas simultáneas
        if (this._cargandoLicencia) {
            console.log("[LICENCIAS] Ya hay una carga en progreso, ignorando...");
            return this.licenciaActual;
        }

        this._cargandoLicencia = true;

        try {
            const user = window.pb.authStore.model;
            if (!user || !user.id) {
                console.log("[LICENCIAS] No hay usuario autenticado");
                return null;
            }

            console.log("[LICENCIAS] Buscando licencia para usuario:", user.id);

            // Usar requestKey único y desactivar auto-cancelación
            const licencias = await window.pb.collection('licencias').getFullList({
                filter: `user_id = "${user.id}"`,
                requestKey: 'carga_licencia_' + Date.now(), // ← Clave única
                $autoCancel: false // ← Desactivar auto-cancelación
            });

            if (licencias.length > 0) {
                this.licenciaActual = licencias[0];
                console.log("%c[LICENCIAS] Licencia cargada:", "color: #10b981;", this.licenciaActual);

                await this.verificarEstadoLicencia();

                return this.licenciaActual;
            } else {
                console.log("[LICENCIAS] No hay licencia asignada a este usuario");
                this.licenciaActual = null;
                this.actualizarUILicencia('suspendida', null);
            }
            return null;
        } catch (error) {
            console.error("[LICENCIAS] Error cargando licencia:", error);
            return null;
        } finally {
            this._cargandoLicencia = false;
        }
    },
    
    async verificarEstadoLicencia() {
        if (!this.licenciaActual) return false;
        
        // Verificar si está expirada
        const hoy = new Date();
        const fechaExpiracion = this.licenciaActual.expired ? new Date(this.licenciaActual.expired) : null;
        
        let expirada = false;
        if (fechaExpiracion && fechaExpiracion < hoy) {
            expirada = true;
        }
        
        // Determinar estado real
        const estado = expirada ? 'suspendida' : (this.licenciaActual.estado || 'activa');
        
        // Actualizar UI global
        this.actualizarUILicencia(estado, fechaExpiracion);
        
        return estado === 'activa';
    },

    // este bloque de codigo sirve para actualizar el estado de la licencia en la interfaz de usuario, mostrando un badge con el estado actual y la fecha de expiracion, ademas de habilitar o deshabilitar las funciones de ventas segun corresponda
    actualizarUILicencia(estado, fechaExpiracion) {
            // Actualizar el badge de estado
            const badge = document.getElementById('statusLicenciaGlobal');
            if (!badge) return;

            if (estado === 'activa') {
                badge.className = 'px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-2 text-sm font-bold';
                badge.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-lucide="shield-check" class="lucide lucide-shield-check w-4 h-4"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path><path d="m9 12 2 2 4-4"></path></svg>
                    Suscripción Activa
                `;

                // Habilitar botones de ventas
                this.habilitarVentas(true);
            } else {
                badge.className = 'px-4 py-2 rounded-full bg-red-50 text-red-700 border border-red-100 flex items-center gap-2 text-sm font-bold';
                badge.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-lucide="shield-off" class="lucide lucide-shield-off w-4 h-4"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path><path d="M2 2l20 20"></path></svg>
                    Suscripción Suspendida
                `;

                // Deshabilitar ventas y mostrar mensaje
                this.habilitarVentas(false);
                this.mostrarMensajeSuspension();
            }

            // Actualizar texto de expiración
            const detalleTexto = document.getElementById('detalleLicenciaTexto');
            if (detalleTexto) {
                if (fechaExpiracion) {
                    const plan = this.licenciaActual?.plan || 'Profesional';
                    const fechaStr = fechaExpiracion.toLocaleDateString('es-VE');
                    detalleTexto.textContent = `Plan ${plan} - Vence: ${fechaStr}`;
                } else {
                    detalleTexto.textContent = 'Sin licencia asignada';
                }
            }

            // === NUEVO: Mostrar la clave de licencia ===
            const licenciaKeyDisplay = document.getElementById('licenciaKeyDisplay');
            if (licenciaKeyDisplay && this.licenciaActual && this.licenciaActual.key) {
                // Formatear la clave para mostrarla (ej: "XXXX-XXXX-XXXX")
                const key = this.licenciaActual.key;
                // Si es muy larga, mostrar solo últimos caracteres
                if (key.length > 12) {
                    licenciaKeyDisplay.textContent = '••••' + key.slice(-8);
                } else {
                    licenciaKeyDisplay.textContent = key;
                }
                licenciaKeyDisplay.title = this.licenciaActual.key; // Tooltip con la clave completa
            } else if (licenciaKeyDisplay) {
                licenciaKeyDisplay.textContent = 'Sin licencia';
            }
        },
    
    habilitarVentas(habilitar) {
        // Deshabilitar/Habilitar botón de procesar venta
        const btnProcesar = document.getElementById('btnProcesarVenta');
        if (btnProcesar) {
            btnProcesar.disabled = !habilitar;
        }
        
        // Deshabilitar/Habilitar pestaña de ventas (visualmente)
        const tabVentas = document.querySelector('.tab-btn[data-tab="ventas"]');
        if (tabVentas) {
            if (habilitar) {
                tabVentas.classList.remove('opacity-50', 'pointer-events-none');
                tabVentas.title = '';
            } else {
                tabVentas.classList.add('opacity-50', 'pointer-events-none');
                tabVentas.title = 'Licencia suspendida - Renueve para acceder';
            }
        }
    },
    
    mostrarMensajeSuspension() {
        // Buscar el contenedor de mensajes en la pestaña de ventas
        const infoMessage = document.getElementById('infoMessage');
        if (!infoMessage) return;
        
        // Guardar el contenido original si no lo hemos guardado ya
        if (!infoMessage.dataset.originalHtml) {
            infoMessage.dataset.originalHtml = infoMessage.innerHTML;
        }
        
        // Mostrar mensaje de suspensión
        infoMessage.className = 'mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl flex items-center gap-3';
        infoMessage.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-lucide="alert-triangle" class="lucide lucide-alert-triangle text-red-600 w-5 h-5"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
            <p class="text-red-800 text-sm font-medium">
                <span class="font-bold">CUENTA SUSPENDIDA:</span> Su licencia ha vencido. Actualice su licencia para restablecer las funciones del sistema.
            </p>
            <button onclick="GestionLicencias.restaurarMensajeOriginal()" class="ml-auto text-red-400 hover:text-red-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-lucide="x" class="w-4 h-4"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
            </button>
        `;
    },
    
    restaurarMensajeOriginal() {
        const infoMessage = document.getElementById('infoMessage');
        if (infoMessage && infoMessage.dataset.originalHtml) {
            infoMessage.innerHTML = infoMessage.dataset.originalHtml;
            infoMessage.className = 'mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-xl flex items-center gap-3 animate-pulse';
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

                // Usar requestKey único y desactivar auto-cancelación
                const vendedores = await window.pb.collection('vendedores').getFullList({
            filter: `admin_id = "${user.id}"`,
            requestKey: 'conteo_vendedores_' + Date.now(), // ← Clave única
            $autoCancel: false // ← Desactivar auto-cancelación
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

            if (disponibles <= 0) {
                contadorEl.className = 'text-xs font-bold px-2 py-1 bg-red-100 text-red-700 rounded-lg';
            } else if (disponibles <= 2) {
                contadorEl.className = 'text-xs font-bold px-2 py-1 bg-amber-100 text-amber-700 rounded-lg';
            } else {
                contadorEl.className = 'text-xs font-bold px-2 py-1 bg-blue-100 text-blue-700 rounded-lg';
            }

            return disponibles;
        } catch (error) {
            console.error("[LICENCIAS] Error actualizando contador:", error);
            contadorEl.textContent = 'Error al cargar';
            return 0;
        }
    }
};

const AuthSecurity = {
    // Límites definidos por el propietario (respaldo)
    LIMITES: {
        admin: 1,
        vendedor: 4,
        usuario: 2
    },

    async inicializar() {
        window.AuthSecurity = this;
        window.GestionLicencias = GestionLicencias; // Exponer globalmente
        
        console.log("%c[SEGURIDAD] Vigilante de acceso sincronizado", "color: #ef4444; font-weight: bold;");
        
        // Inicializar gestión de licencias
        await GestionLicencias.inicializar();
        
        // 1. Si ya hay sesión (F5 o persistencia)
        if (window.pb.authStore.isValid) {
            await this.validarSesionUnica();
        }

        // 2. ESCUCHA REACTIVA: Si el usuario hace login sin refrescar la página
        window.pb.authStore.onChange((token, model) => {
            if (token) {
                console.log("[SEGURIDAD] Nueva sesión detectada, validando...");
                this.validarSesionUnica();
                GestionLicencias.cargarLicenciaUsuario();
            }
        });
    },

    // Genera una huella única basada en el navegador y hardware
    generarFingerprint() {
        const userAgent = navigator.userAgent;
        const screenRes = `${screen.width}x${screen.height}`;
        return btoa(`${userAgent}-${screenRes}`).substring(0, 32);
    },

    async validarSesionUnica() {
        const user = window.pb.authStore.model;
        if (!user) return false;

        const fingerprintActual = this.generarFingerprint();

        try {
            const serverUser = await window.pb.collection('users').getOne(user.id, { $autoCancel: false });

            // A) VALIDACIÓN DE SESIÓN DUPLICADA
            if (serverUser.is_online && serverUser.session_id && serverUser.session_id !== fingerprintActual) {
                await Swal.fire({
                    icon: 'error',
                    title: 'Acceso Restringido',
                    text: 'Esta cuenta ya está activa en otro dispositivo o navegador.',
                    confirmButtonText: 'Cerrar'
                });
                window.pb.authStore.clear();
                return false;
            }

            // B) VALIDACIÓN DE CUPOS POR ROL
            const activos = await window.pb.collection('users').getList(1, 1, {
                filter: `user_role = "${serverUser.user_role}" && is_online = true && id != "${user.id}"`
            });

            const limite = this.LIMITES[serverUser.user_role] || 2;
            if (activos.totalItems >= limite) {
                await Swal.fire({
                    icon: 'warning',
                    title: 'Límite Alcanzado',
                    text: `Ya hay ${limite} sesiones de ${serverUser.user_role} activas.`,
                });
                window.pb.authStore.clear();
                return false;
            }

            // C) REGISTRO EXITOSO
            await window.pb.collection('users').update(user.id, {
                session_id: fingerprintActual,
                is_online: true
            });

            console.log("%c[SEGURIDAD] Dispositivo anclado y validado", "color: #10b981;");
            return true;

        } catch (error) {
            console.error("[SEGURIDAD] Error de enlace:", error);
            return true;
        }
    },

    async verificarCupos(rol) {
        try {
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