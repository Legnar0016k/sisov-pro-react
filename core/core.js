//======================================================//
//======================CORE.JS=========================//
//======================================================//

var pb = new PocketBase('https://sisov-pro-react-production.up.railway.app');

// Parche "LLAVE MAESTRA" para CORS
pb.beforeSend = function (url, options) {
    options.mode = 'cors';
    return { url, options };
};
window.pb = pb;

// ===== SISTEMA PRINCIPAL =====
const Sistema = {
    estado: {
        usuario: null,
        tasaBCV: 0,
        productos: [],
        carrito: [],
        ventas: [],
        config: {
            tasaManual: false,
            serverTime: null
        }
    },

    async inicializar() {
        const fechaData = await this.actualizarHoraServidor();
        if (fechaData && fechaData.iso) {
            this.iniciarRelojVisual(fechaData.iso);
        }
        
        lucide.createIcons();
        
        await this.verificarAutenticacion();
        await this.cargarDatosIniciales();

        if (window.GestionLicencias) {
            window.GestionLicencias.actualizarContadorVendedores();
        }
        
        this.configurarEventos();
        
        console.log("%c[SISTEMA] Inicialización completa con hora sincronizada", "color: #10b981;");

        window.refrescarIconos = function() {
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        };
    },

    async verificarAutenticacion() {
        try {
            const token = localStorage.getItem('sisov_token');
            const userData = localStorage.getItem('sisov_user');
            
            if (token && userData) {
                this.estado.usuario = JSON.parse(userData);
                this.mostrarVistaPrincipal();
                return true;
            }
        } catch (error) {
            console.error('Error verificando autenticación:', error);
        }
        return false;
    },
    
    async iniciarSesion(email, password) {
        try {
            pb = new PocketBase('https://sisov-pro-react-production.up.railway.app');
            
            const authData = await pb.collection('users').authWithPassword(email, password);
            
            if (authData && authData.token) {
                if (window.AuthSecurity) {
                    const accesoPermitido = await window.AuthSecurity.validarSesionUnica();
                    if (!accesoPermitido) {
                        return false; 
                    }
                }

                this.estado.usuario = {
                    id: authData.record.id,
                    email: authData.record.email,
                    nombre: authData.record.user_name || 'Usuario',
                    rol: authData.record.user_role || 'user'
                };
                
                localStorage.setItem('sisov_token', authData.token);
                localStorage.setItem('sisov_user', JSON.stringify(this.estado.usuario));
                
                this.mostrarToast('Sesión iniciada correctamente', 'success');
                this.mostrarVistaPrincipal();
                
                await this.inicializar();
                
                return true;
            }
        } catch (error) {
            console.error('Error en inicio de sesión:', error);
            this.mostrarToast('Credenciales incorrectas', 'error');
        }
        return false;
    },
    
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
    
    mostrarVistaPrincipal() {
        document.getElementById('loginView').classList.add('hidden');
        document.getElementById('mainView').classList.remove('hidden');
        
        this.actualizarUIUsuario();
        this.cambiarTab('ventas');
        
        if (window.Inventario) {
            window.Inventario.cargarProductos();
        }

        // Asegurar que el splash se oculte
        const splash = document.getElementById('splashScreen');
        if (splash && !splash.classList.contains('hidden')) {
            splash.classList.add('hidden');
        }
    },
    
    actualizarUIUsuario() {
        if (this.estado.usuario) {
            document.getElementById('userName').textContent = this.estado.usuario.nombre;
            document.getElementById('userRole').textContent = this.estado.usuario.rol.toUpperCase();
        }
    },
    
    cambiarTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.remove('active');
        });
        
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('border-primary', 'text-primary');
            btn.classList.add('border-transparent', 'text-slate-600');
        });
        
        const tab = document.getElementById(`tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
        if (tab) {
            tab.classList.add('active');
        }
        
        const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if (btn) {
            btn.classList.remove('border-transparent', 'text-slate-600');
            btn.classList.add('border-primary', 'text-primary');
        }
        
        switch(tabId) {
            case 'ventas':
                if (window.Ventas) {
                    window.Ventas.renderizarProductos();
                    window.Ventas.actualizarCarritoUI();
                }
                break;
            case 'inventario':
                if (window.Inventario) {
                    window.Inventario.renderizarInventario();
                }
                break;
                
            case 'reportes':
                if (window.Reportes) {
                    window.Reportes.cargarReportes();
                }
                break;
        }
    },
    
    async cargarTasaBCV() {
        try {
            const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
            const data = await response.json();
            
            if (data.rates.VES) {
                this.estado.tasaBCV = data.rates.VES;
                this.estado.config.tasaManual = false;
            }
        } catch (error) {
            console.warn('No se pudo obtener tasa de API, usando valor por defecto');
            this.estado.tasaBCV = 36.50;
        }
        
        this.actualizarTasaUI();
    },
    
    actualizarTasaUI() {
        const rateElement = document.getElementById('rateValue');
        if (rateElement) {
            rateElement.textContent = this.estado.tasaBCV.toFixed(2);
        }
    },
    
    mostrarModalTasa() {
        document.getElementById('modalTasa').classList.add('active');
        document.getElementById('referenciaRate').textContent = this.estado.tasaBCV.toFixed(2);
    },
    
    cerrarModalTasa() {
        document.getElementById('modalTasa').classList.remove('active');
    },
    
    async obtenerTasaReferencia() {
        try {
            const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
            const data = await response.json();
            
            if (data.rates.VES) {
                document.getElementById('referenciaRate').textContent = data.rates.VES.toFixed(2);
                this.mostrarToast('Tasa actualizada', 'success');
            }
        } catch (error) {
            this.mostrarToast('Error obteniendo tasa', 'error');
        }
    },
    
    guardarTasaManual() {
        const input = document.getElementById('tasaManualInput');
        const tasa = parseFloat(input.value);
        
        if (tasa && tasa > 0) {
            this.estado.tasaBCV = tasa;
            this.estado.config.tasaManual = true;
            this.actualizarTasaUI();
            this.cerrarModalTasa();
            this.mostrarToast('Tasa guardada correctamente', 'success');
        } else {
            this.mostrarToast('Ingrese una tasa válida', 'error');
        }
    },
    
    async cargarDatosIniciales() {
        await this.cargarTasaBCV();
    },
    
    async actualizarHoraServidor() {
        try {
            const response = await fetch('https://web-production-81e05.up.railway.app/hora-venezuela');
            const data = await response.json();
    
            if (data.ok && data.iso) {
                const isoLimpia = data.iso.replace('Z', ''); 
                this.estado.config.serverTime = new Date(isoLimpia);
                console.log("%c[SISTEMA] Hora de Venezuela sincronizada (Reloj Blindado)", "color: #10b981; font-weight: bold;");
                return data; 
            }
            return null;
        } catch (error) {
            console.error("Error, sincronizando hora propia:", error);
            this.estado.config.serverTime = new Date();
            return null;
        }
    },

    iniciarRelojVisual(horaInicial) {
        let tiempoActual = new Date(horaInicial.replace('Z', ''));
        
        setInterval(() => {
            tiempoActual.setSeconds(tiempoActual.getSeconds() + 1);
            
            if (window.TimeModule) {
                window.TimeModule.actualizarUI(tiempoActual);
            }
        }, 1000);
    },
    
    configurarEventos() {
        document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const btn = document.getElementById('loginBtn');
            
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="loader" class="w-5 h-5 animate-spin"></i> CARGANDO...';
            btn.disabled = true;
            
            await this.iniciarSesion(email, password);
            
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        });
    },
    
    mostrarToast(mensaje, tipo = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${tipo}`;
        toast.textContent = mensaje;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    },
    
    formatearMoneda(monto, moneda = 'USD') {
        if (moneda === 'USD') {
            return `$${parseFloat(monto).toFixed(2)}`;
        } else {
            return `${parseFloat(monto).toFixed(2)} Bs`;
        }
    },
    
    generarID() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    activarVentasManual(elemento) {
        this.cambiarTab('ventas');
        elemento.classList.remove('tab-atencion');
        
        console.log("%c[ACCION] Activando renderizado manual de productos...", "color: #10b981; font-weight: bold;");
        
        if (window.Inventario && window.Inventario.cargarProductos) {
            window.Inventario.cargarProductos();
        }

        if (window.Reportes && window.Reportes.cargarEstadisticas) {
            window.Reportes.cargarEstadisticas();
        }
    }
};

// Exponer globalmente
window.Sistema = Sistema;
window.SISOV_BOOT_COMPLETE = window.SISOV_BOOT_COMPLETE || false;
// Después de cargar productos
if (window.Ventas) {
    window.Ventas.cargarCarritoPersistente();
    window.Ventas.actualizarCarritoUI();
}


