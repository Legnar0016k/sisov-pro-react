//======================================================//
//======================CORE.JS=========================//
//======================================================//

var pb = new PocketBase('https://sisov-pro-react-production.up.railway.app');
pb.beforeSend = (url, options) => { options.mode = 'cors'; return { url, options }; };
window.pb = pb;

const Sistema = {
    estado: {
        usuario: null,
        tasaBCV: 0,
        productos: [],
        carrito: [],
        ventas: [],
        config: { tasaManual: false, serverTime: null }
    },

    async inicializar() {
        console.log("[SISTEMA] Iniciando...");
        
        // 1. Sincronizar hora
        await this.actualizarHoraServidor();
        
        // 2. Cargar tasa BCV
        await this.cargarTasaBCV();
        
        // 3. Verificar autenticación
        await this.verificarAutenticacion();
        
        // 4. Configurar eventos
        this.configurarEventos();
        
        // 5. Si hay sesión, cargar datos
        if (this.estado.usuario) {
            if (window.Inventario) await window.Inventario.cargarProductos();
            if (window.Ventas) {
                window.Ventas.cargarCarritoPersistente();
                window.Ventas.actualizarCarritoUI();
            }
            if (window.GestionLicencias) window.GestionLicencias.actualizarContadorVendedores();
        }
        
        console.log("%c[SISTEMA] Listo", "color: #10b981;");
    },

    async verificarAutenticacion() {
        const token = localStorage.getItem('sisov_token');
        const userData = localStorage.getItem('sisov_user');
        
        if (token && userData) {
            this.estado.usuario = JSON.parse(userData);
            document.getElementById('loginView').classList.add('hidden');
            document.getElementById('mainView').classList.remove('hidden');
            this.actualizarUIUsuario();
            return true;
        } else {
            document.getElementById('loginView').classList.remove('hidden');
            document.getElementById('mainView').classList.add('hidden');
            return false;
        }
    },
    
    async iniciarSesion(email, password) {
        try {
            const authData = await pb.collection('users').authWithPassword(email, password);
            
            if (authData?.token) {
                if (window.AuthSecurity) {
                    const acceso = await window.AuthSecurity.validarSesionUnica();
                    if (!acceso) return false;
                }

                this.estado.usuario = {
                    id: authData.record.id,
                    email: authData.record.email,
                    nombre: authData.record.user_name || 'Usuario',
                    rol: authData.record.user_role || 'user'
                };
                
                localStorage.setItem('sisov_token', authData.token);
                localStorage.setItem('sisov_user', JSON.stringify(this.estado.usuario));
                
                this.mostrarVistaPrincipal();
                this.mostrarToast('Sesión iniciada', 'success');
                
                // Recargar datos
                if (window.Inventario) await window.Inventario.cargarProductos();
                if (window.Ventas) {
                    window.Ventas.cargarCarritoPersistente();
                    window.Ventas.actualizarCarritoUI();
                }
                
                return true;
            }
        } catch (error) {
            this.mostrarToast('Credenciales incorrectas', 'error');
        }
        return false;
    },
    
   mostrarVistaPrincipal() {
        document.getElementById('loginView').classList.add('hidden');
        document.getElementById('mainView').classList.remove('hidden');
        this.actualizarUIUsuario();
        this.cambiarTab('ventas'); // ← Esto asegura que ventas sea la pestaña activa
    },
    
    actualizarUIUsuario() {
        if (this.estado.usuario) {
            document.getElementById('userName').textContent = this.estado.usuario.nombre;
            document.getElementById('userRole').textContent = this.estado.usuario.rol.toUpperCase();
        }
    },
    
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

        // Acciones específicas
        if (tabId === 'ventas' && window.Ventas) {
            window.Ventas.renderizarProductos();
            window.Ventas.actualizarCarritoUI();
        } else if (tabId === 'inventario' && window.Inventario) {
            window.Inventario.renderizarInventario();
        } else if (tabId === 'reportes' && window.Reportes) {
            window.Reportes.cargarReportes();
        } else if (tabId === 'configuracion') {
            // No hay acciones específicas, solo mostrar la pestaña
            console.log("[SISTEMA] Pestaña de configuración");

            // Si quieres actualizar algo específico al entrar a configuración
            if (window.GestionLicencias) {
                window.GestionLicencias.actualizarContadorVendedores();
            }
        }
    },

    // En core.js, dentro del objeto Sistema, debe estar:

async cerrarSesion() {
    Swal.fire({
        title: '¿Cerrar sesión?',
        text: 'Selecciona una opción',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Cerrar',
        cancelButtonText: 'Cancelar'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                if (window.pb && window.pb.authStore.model) {
                    const userId = window.pb.authStore.model.id;
                    await window.pb.collection('users').update(userId, {
                        session_id: "",
                        is_online: false
                    });
                }
            } catch (error) {
                console.warn("[SEGURIDAD] Error al liberar sesión en servidor, procediendo localmente.");
            }

            localStorage.clear();
            if (window.pb) window.pb.authStore.clear();
            
            this.estado.usuario = null;
            this.estado.carrito = [];
            
            document.getElementById('loginView').classList.remove('hidden');
            document.getElementById('mainView').classList.add('hidden');
            
            this.mostrarToast('Sesión cerrada', 'info');

            setTimeout(() => window.location.reload(), 1000); 
        }
    });
},

    
    async cargarTasaBCV() {
        try {
            const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
            const data = await res.json();
            if (data.rates.VES) this.estado.tasaBCV = data.rates.VES;
        } catch {
            this.estado.tasaBCV = 36.50;
        }
        this.actualizarTasaUI();
    },
    
    actualizarTasaUI() {
        const el = document.getElementById('rateValue');
        if (el) el.textContent = this.estado.tasaBCV.toFixed(2);
    },
    
    mostrarModalTasa() {
        document.getElementById('modalTasa').classList.add('active');
        document.getElementById('referenciaRate').textContent = this.estado.tasaBCV.toFixed(2);
    },
    
    cerrarModalTasa() {
        document.getElementById('modalTasa').classList.remove('active');
    },
    
    async obtenerTasaReferencia() {
        await this.cargarTasaBCV();
        this.mostrarToast('Tasa actualizada', 'success');
    },
    
    guardarTasaManual() {
        const input = document.getElementById('tasaManualInput');
        const tasa = parseFloat(input.value);
        if (tasa > 0) {
            this.estado.tasaBCV = tasa;
            this.estado.config.tasaManual = true;
            this.actualizarTasaUI();
            this.cerrarModalTasa();
            this.mostrarToast('Tasa guardada', 'success');
        }
    },
    
    async actualizarHoraServidor() {
        try {
            const res = await fetch('https://web-production-81e05.up.railway.app/hora-venezuela');
            const data = await res.json();
            if (data.ok && data.iso) {
                this.estado.config.serverTime = new Date(data.iso.replace('Z', ''));
                this.iniciarRelojVisual(data.iso);
            }
        } catch (error) {
            this.estado.config.serverTime = new Date();
        }
    },

    iniciarRelojVisual(horaInicial) {
        let tiempo = new Date(horaInicial.replace('Z', ''));
        setInterval(() => {
            tiempo.setSeconds(tiempo.getSeconds() + 1);
            if (window.TimeModule) window.TimeModule.actualizarUI(tiempo);
        }, 1000);
    },
    
    configurarEventos() {
        document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('loginBtn');
            btn.disabled = true;
            btn.innerHTML = 'CARGANDO...';
            
            await this.iniciarSesion(
                document.getElementById('email').value,
                document.getElementById('password').value
            );
            
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="log-in"></i> INICIAR SESIÓN';
            if (window.lucide) lucide.createIcons();
        });
    },
    
    mostrarToast(mensaje, tipo) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${tipo}`;
        toast.textContent = mensaje;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },
    
    formatearMoneda(monto, moneda = 'USD') {
        return moneda === 'USD' ? `$${parseFloat(monto).toFixed(2)}` : `${parseFloat(monto).toFixed(2)} Bs`;
    },

    activarVentasManual(elemento) {
        this.cambiarTab('ventas');
        elemento.classList.remove('tab-atencion');
        if (window.Inventario) window.Inventario.cargarProductos();
        if (window.Reportes) window.Reportes.cargarEstadisticas();
    }
};

window.Sistema = Sistema;