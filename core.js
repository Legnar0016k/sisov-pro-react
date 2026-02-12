//======================================================//
//======================CORE.JS=========================//
//======================================================//

  var pb = new PocketBase('https://sisov-pro-react-production.up.railway.app');
  // --- ESTE ES EL PARCHE "LLAVE MAESTRA" ---
// Esto modifica la forma en que se envían las peticiones para evitar bloqueos
pb.beforeSend = function (url, options) {
    options.mode = 'cors'; // Forzamos el modo cors
    return { url, options };
};
    window.pb = pb; // Esto le abre la puerta al parche

        // ===== SISTEMA PRINCIPAL =====
        const Sistema = {
            // Estado global
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
            
            
           // Inicialización - Versión Optimizada por V.I.E.R.N.E.S.(11/02/2026)
            async inicializar() {
                
                // 1. Sincronizar Reloj (Prioridad Máxima)
                // Usamos await para que el sistema espere la hora real de Venezuela antes de 
                // continuar con cualquier otra acción. Esto garantiza que todas las funciones 
                // dependientes del tiempo tengan la referencia correcta desde el inicio.
                // ahora la hora vive el el frontend, pero es la hora oficial de venezuela, no la del cliente
                const fechaData = await this.actualizarHoraServidor();
                if (fechaData && fechaData.iso) {
                this.iniciarRelojVisual(fechaData.iso);
                }
                
                // 2. Inicializar íconos
                lucide.createIcons();
                
                // 3. Verificar autenticación
                await this.verificarAutenticacion();
                
                // 4. Cargar datos iniciales 
                // (Ahora cargarDatosIniciales ya sabrá exactamente qué fecha es hoy)
                await this.cargarDatosIniciales();
                
                // 5. Configurar eventos
                this.configurarEventos();
                
                console.log("%c[SISTEMA] Inicialización completa con hora sincronizada", "color: #10b981;");
            },
            
            // Autenticación
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
                    // Configurar PocketBase
                    pb = new PocketBase('https://sisov-pro-react-production.up.railway.app');
                    
                    
                    // Autenticar
                    const authData = await pb.collection('users').authWithPassword(email, password);
                    
                    if (authData && authData.token) {
                        // Guardar datos
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
                        // --- INICIO DE LÓGICA DE SEGURIDAD BLINDADA ---
                        try {
                            if (window.pb && window.pb.authStore.model) {
                                const userId = window.pb.authStore.model.id;
                                // Notificamos al servidor que el dispositivo queda libre antes de limpiar local
                                await window.pb.collection('users').update(userId, {
                                    session_id: "",
                                    is_online: false
                                });
                            }
                        } catch (error) {
                            console.warn("[SEGURIDAD] Error al liberar sesión en servidor, procediendo localmente.");
                        }
                        // --- FIN DE LÓGICA DE SEGURIDAD ---

                        // Mantenemos intacta tu lógica original y estética
                        localStorage.clear();
                        if (window.pb) window.pb.authStore.clear(); // Limpieza del token de PocketBase
                        
                        this.estado.usuario = null;
                        this.estado.carrito = [];
                        
                        document.getElementById('loginView').classList.remove('hidden');
                        document.getElementById('mainView').classList.add('hidden');
                        
                        this.mostrarToast('Sesión cerrada', 'info');

                        // Recarga opcional para limpiar memoria de scripts dinámicos
                        setTimeout(() => window.location.reload(), 1000); 
                    }
                });
            },
            
            // Vistas
            mostrarVistaPrincipal() {
                document.getElementById('loginView').classList.add('hidden');
                document.getElementById('mainView').classList.remove('hidden');
                
                // Actualizar UI
                this.actualizarUIUsuario();
                this.cambiarTab('ventas');
                
                // Cargar productos
                Inventario.cargarProductos();
            },
            
            actualizarUIUsuario() {
                if (this.estado.usuario) {
                    document.getElementById('userName').textContent = this.estado.usuario.nombre;
                    document.getElementById('userRole').textContent = this.estado.usuario.rol.toUpperCase();
                }
            },
            
            // Tabs
            cambiarTab(tabId) {
                // Ocultar todos los tabs
                document.querySelectorAll('.tab-content').forEach(tab => {
                    tab.classList.remove('active');
                });
                
                // Quitar activo de botones
                document.querySelectorAll('.tab-btn').forEach(btn => {
                    btn.classList.remove('border-primary', 'text-primary');
                    btn.classList.add('border-transparent', 'text-slate-600');
                });
                
                // Mostrar tab seleccionado
                const tab = document.getElementById(`tab${tabId.charAt(0).toUpperCase() + tabId.slice(1)}`);
                if (tab) {
                    tab.classList.add('active');
                }
                
                // Activar botón
                const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
                if (btn) {
                    btn.classList.remove('border-transparent', 'text-slate-600');
                    btn.classList.add('border-primary', 'text-primary');
                }
                
                // Ejecutar acciones específicas del tab
                switch(tabId) {
                    case 'ventas':
                        Ventas.renderizarProductos();
                        Ventas.actualizarCarritoUI();
                        break;
                    case 'inventario':
                        Inventario.renderizarInventario();
                        break;
                    case 'reportes':
                        Reportes.cargarReportes();
                        break;
                }
            },
            
            // Tasa BCV
            async cargarTasaBCV() {
                try {
                    // Intentar obtener de API
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
            
            // Carga de datos
            async cargarDatosIniciales() {
                await this.cargarTasaBCV();
            },
            
            // Hora del servidor propio 
            async actualizarHoraServidor() {
                try {
                    const response = await fetch('https://web-production-81e05.up.railway.app/hora-venezuela');
                    const data = await response.json();
        
                if (data.ok && data.iso) {
                    // Convertimos a Date y forzamos la corrección de desfase si el navegador insiste en restar
                    const isoLimpia = data.iso.replace('Z', ''); 
                        this.estado.config.serverTime = new Date(isoLimpia);
                    console.log("%c[SISTEMA] Hora de Venezuela sincronizada (Reloj Blindado)", "color: #10b981; font-weight: bold;");
                    return data; 
                }
                return null;
                }   catch (error) {
                    console.error("Error, sincronizando hora propia:", error);
                    this.estado.config.serverTime = new Date();
                    return null;
                }
            }, 

             // --- NUEVO: Motor del Reloj Visual --- se simplifica para pasar la carga a 
             // TimeModule y evitar cálculos innecesarios en el Core
           iniciarRelojVisual(horaInicial) {
                let tiempoActual = new Date(horaInicial.replace('Z', ''));
                
                setInterval(() => {
                    tiempoActual.setSeconds(tiempoActual.getSeconds() + 1);
                    
                    // LLAMADA AL MÓDULO EXTERNO
                    if (window.TimeModule) {
                        TimeModule.actualizarUI(tiempoActual);
                    }
                }, 1000);
            },
            
            // Eventos
            configurarEventos() {
                // Login form
                document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    
                    const email = document.getElementById('email').value;
                    const password = document.getElementById('password').value;
                    const btn = document.getElementById('loginBtn');
                    
                    // Cambiar estado del botón
                    const originalHTML = btn.innerHTML;
                    btn.innerHTML = '<i data-lucide="loader" class="w-5 h-5 animate-spin"></i> CARGANDO...';
                    btn.disabled = true;
                    
                    await this.iniciarSesion(email, password);
                    
                    // Restaurar botón
                    btn.innerHTML = originalHTML;
                    btn.disabled = false;
                });
            },
            
            // Utilidades
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
            }


            
        };
        
        // ===== MÓDULO DE VENTAS =====
        const Ventas = {
            carrito: [],
            metodoPago: 'EFECTIVO',
            
            async cargarProductosVenta() {
                // Usar productos del sistema
                return Sistema.estado.productos;
            },
            
            renderizarProductos() {
                const container = document.getElementById('productGrid');
                if (!container) return;
                
                container.innerHTML = '';
                
                Sistema.estado.productos.forEach(producto => {
                    const card = this.crearCardProducto(producto);
                    container.appendChild(card);
                });
            },
            
            crearCardProducto(producto) {
                const div = document.createElement('div');
                div.className = 'bg-white rounded-xl shadow border border-slate-200 p-4 card-hover';
                div.innerHTML = `
                    <div class="mb-3">
                        <span class="text-xs font-semibold text-slate-500">${producto.category || 'General'}</span>
                        <h4 class="font-bold text-slate-800 truncate">${producto.name_p}</h4>
                        <p class="text-xs text-slate-500 font-mono">${producto.id_p || producto.id}</p>
                    </div>
                    
                    <div class="flex items-center justify-between mb-4">
                        <div>
                            <span class="text-lg font-bold text-primary">${Sistema.formatearMoneda(producto.price_usd)}</span>
                            <p class="text-xs text-slate-500">${(producto.price_usd * Sistema.estado.tasaBCV).toFixed(2)} Bs</p>
                        </div>
                        <span class="badge ${producto.stock > 10 ? 'badge-success' : producto.stock > 0 ? 'badge-warning' : 'badge-danger'}">
                            ${producto.stock} unidades
                        </span>
                    </div>
                    
                    <button onclick="Ventas.agregarAlCarrito('${producto.id}')" 
                            ${producto.stock <= 0 ? 'disabled' : ''}
                            class="w-full btn-primary py-2 rounded-lg text-white font-semibold ${producto.stock <= 0 ? 'opacity-50 cursor-not-allowed' : ''}">
                        <i data-lucide="shopping-cart" class="w-4 h-4 inline mr-2"></i>
                        Agregar
                    </button>
                `;
                
                return div;
            },
            
            agregarAlCarrito(productoId) {
                const producto = Sistema.estado.productos.find(p => p.id === productoId);
                if (!producto) return;
                
                // Verificar stock
                if (producto.stock <= 0) {
                    Sistema.mostrarToast('Producto sin stock', 'error');
                    return;
                }
                
                // Buscar si ya está en el carrito
                const itemIndex = this.carrito.findIndex(item => item.producto.id === productoId);
                
                if (itemIndex >= 0) {
                    // Incrementar cantidad
                    if (this.carrito[itemIndex].cantidad < producto.stock) {
                        this.carrito[itemIndex].cantidad++;
                    } else {
                        Sistema.mostrarToast('No hay suficiente stock', 'error');
                        return;
                    }
                } else {
                    // Agregar nuevo item
                    this.carrito.push({
                        producto: producto,
                        cantidad: 1
                    });
                }
                
                this.actualizarCarritoUI();
                Sistema.mostrarToast('Producto agregado al carrito', 'success');
            },
            
            removerDelCarrito(index) {
                this.carrito.splice(index, 1);
                this.actualizarCarritoUI();
                Sistema.mostrarToast('Producto removido', 'info');
            },
            
            actualizarCantidad(index, nuevaCantidad) {
                if (nuevaCantidad < 1) {
                    this.removerDelCarrito(index);
                    return;
                }
                
                const producto = this.carrito[index].producto;
                if (nuevaCantidad > producto.stock) {
                    Sistema.mostrarToast(`Solo hay ${producto.stock} unidades disponibles`, 'error');
                    return;
                }
                
                this.carrito[index].cantidad = nuevaCantidad;
                this.actualizarCarritoUI();
            },
            
            actualizarCarritoUI() {
                const container = document.getElementById('cartItems');
                const countElement = document.getElementById('cartCount');
                const subtotalElement = document.getElementById('subtotalUSD');
                const totalElement = document.getElementById('totalVES');
                const procesarBtn = document.getElementById('btnProcesarVenta');
                
                // Actualizar contador
                countElement.textContent = this.carrito.length;
                
                // Calcular totales
                let subtotalUSD = 0;
                
                this.carrito.forEach(item => {
                    subtotalUSD += item.producto.price_usd * item.cantidad;
                });
                
                const totalVES = subtotalUSD * Sistema.estado.tasaBCV;
                
                // Actualizar elementos
                subtotalElement.textContent = Sistema.formatearMoneda(subtotalUSD);
                totalElement.textContent = Sistema.formatearMoneda(totalVES, 'VES');
                
                // Habilitar/deshabilitar botón
                procesarBtn.disabled = this.carrito.length === 0;
                
                // Renderizar items
                container.innerHTML = '';
                
                if (this.carrito.length === 0) {
                    container.innerHTML = `
                        <div class="text-center py-8 text-slate-400">
                            <i data-lucide="shopping-cart" class="w-12 h-12 mx-auto mb-3 opacity-30"></i>
                            <p class="text-sm font-medium">Carrito vacío</p>
                        </div>
                    `;
                    return;
                }
                
                this.carrito.forEach((item, index) => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'flex items-center justify-between p-3 bg-slate-50 rounded-lg';
                    itemDiv.innerHTML = `
                        <div class="flex-1">
                            <h5 class="font-semibold text-slate-800 text-sm">${item.producto.name_p}</h5>
                            <p class="text-xs text-slate-500">${Sistema.formatearMoneda(item.producto.price_usd)} c/u</p>
                        </div>
                        
                        <div class="flex items-center gap-2">
                            <button onclick="Ventas.actualizarCantidad(${index}, ${item.cantidad - 1})" 
                                    class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300">
                                <i data-lucide="minus" class="w-3 h-3"></i>
                            </button>
                            
                            <span class="w-8 text-center font-bold">${item.cantidad}</span>
                            
                            <button onclick="Ventas.actualizarCantidad(${index}, ${item.cantidad + 1})" 
                                    class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300">
                                <i data-lucide="plus" class="w-3 h-3"></i>
                            </button>
                            
                            <button onclick="Ventas.removerDelCarrito(${index})" 
                                    class="w-8 h-8 flex items-center justify-center rounded-lg bg-red-100 hover:bg-red-200 text-red-600 ml-2">
                                <i data-lucide="trash-2" class="w-3 h-3"></i>
                            </button>
                        </div>
                    `;
                    container.appendChild(itemDiv);
                });
            },
            
            seleccionarMetodoPago(metodo) {
                this.metodoPago = metodo;
                
                // Actualizar UI
                document.querySelectorAll('.payment-method').forEach(btn => {
                    btn.classList.remove('border-primary', 'bg-primary', 'text-white');
                    btn.classList.add('bg-slate-100', 'text-slate-700');
                });
                
                const btnSeleccionado = document.querySelector(`.payment-method[data-method="${metodo}"]`);
                if (btnSeleccionado) {
                    btnSeleccionado.classList.remove('bg-slate-100', 'text-slate-700');
                    btnSeleccionado.classList.add('border-primary', 'bg-primary', 'text-white');
                }
            },
            
            vaciarCarrito() {
                Swal.fire({
                    title: '¿Vaciar carrito?',
                    text: 'Se eliminarán todos los productos',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, vaciar',
                    cancelButtonText: 'Cancelar'
                }).then((result) => {
                    if (result.isConfirmed) {
                        this.carrito = [];
                        this.actualizarCarritoUI();
                        Sistema.mostrarToast('Carrito vaciado', 'info');
                    }
                });
            },
            
            async procesarVenta() {
                if (this.carrito.length === 0) {
                    Sistema.mostrarToast('El carrito está vacío', 'error');
                    return;
                }
                
                // Verificar stock
                for (const item of this.carrito) {
                    if (item.cantidad > item.producto.stock) {
                        Sistema.mostrarToast(`Stock insuficiente de ${item.producto.name_p}`, 'error');
                        return;
                    }
                }
                
                Swal.fire({
                    title: 'Confirmar Venta',
                    html: `
                        <div class="text-left">
                            <p class="mb-2"><strong>Productos:</strong> ${this.carrito.length}</p>
                            <p class="mb-2"><strong>Total USD:</strong> ${this.calcularTotalUSD()}</p>
                            <p class="mb-4"><strong>Total Bs:</strong> ${this.calcularTotalVES()}</p>
                            <p><strong>Método:</strong> ${this.metodoPago}</p>
                        </div>
                    `,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Confirmar Venta',
                    cancelButtonText: 'Cancelar'
                }).then(async (result) => {
                    if (result.isConfirmed) {
                        await this.registrarVenta();
                    }
                });
            },
            
            calcularTotalUSD() {
                return this.carrito.reduce((total, item) => {
                    return total + (item.producto.price_usd * item.cantidad);
                }, 0).toFixed(2);
            },
            
            calcularTotalVES() {
                return (this.calcularTotalUSD() * Sistema.estado.tasaBCV).toFixed(2);
            },
            
            async registrarVenta() {
                try {
                    // Usamos la instancia global de pb para evitar reconexiones innecesarias
                    const pb = window.pb || new PocketBase('https://sisov-pro-react-production.up.railway.app');
                    
                    // [V.I.E.R.N.E.S. Inserción] - Generar fecha inmutable de Venezuela
                    // Usamos el reloj sincronizado del sistema
                    const fechaInmutable = Sistema.estado.config.serverTime.toISOString().split('T')[0];

                    // Preparar datos de la venta
                    const ventaData = {
                        user_id: Sistema.estado.usuario.id,
                        user_email: Sistema.estado.usuario.email,
                        user_role: Sistema.estado.usuario.rol,
                        n_factura: `FAC-${Date.now().toString().slice(-6)}`,
                        dolartoday: Sistema.estado.tasaBCV,
                        total_usd: parseFloat(this.calcularTotalUSD()),
                        total_ves: parseFloat(this.calcularTotalVES()),
                        items: JSON.stringify(this.carrito.map(item => ({
                            producto: item.producto.name_p,
                            cantidad: item.cantidad,
                            precio_unitario: item.producto.price_usd,
                            subtotal: item.producto.price_usd * item.cantidad
                        }))),
                        payment_method: this.metodoPago,
                        payment_details: {},
                        // CAMPO CLAVE: Sentido horario inmutable venezolano
                        id_fecha: fechaInmutable 
                    };
                    
                    // Registrar venta en la colección sales
                    await pb.collection('sales').create(ventaData);
                    
                    // Actualizar stock de productos
                    for (const item of this.carrito) {
                        const nuevoStock = item.producto.stock - item.cantidad;
                        await pb.collection('products').update(item.producto.id, {
                            stock: nuevoStock
                        });
                        
                        // Actualizar en estado local para reflejo inmediato en UI
                        const productoIndex = Sistema.estado.productos.findIndex(p => p.id === item.producto.id);
                        if (productoIndex >= 0) {
                            Sistema.estado.productos[productoIndex].stock = nuevoStock;
                        }
                    }
                    
                    // Registrar en logs de sistema
                    await pb.collection('system_logs').create({
                        type: 'VENTA',
                        message: `Venta procesada por ${Sistema.estado.usuario.nombre || Sistema.estado.usuario.email}`,
                        user: Sistema.estado.usuario.email,
                        context: {
                            factura: ventaData.n_factura,
                            total_usd: ventaData.total_usd,
                            items_count: this.carrito.length,
                            fecha_id: fechaInmutable
                        }
                    });
                    
                    // Limpiar carrito y resetear UI de ventas
                    this.carrito = [];
                    if (typeof this.actualizarCarritoUI === 'function') this.actualizarCarritoUI();
                    
                    // Refrescar las vistas de la aplicación
                    if (window.Ventas && Ventas.renderizarProductos) Ventas.renderizarProductos();
                    if (window.Inventario && Inventario.cargarProductos) Inventario.cargarProductos();
                    if (window.Reportes && Reportes.cargarEstadisticas) {
                        // Forzamos actualización de estadísticas con la fecha de hoy
                        Reportes.cargarEstadisticas(fechaInmutable);
                    }
                    
                    Sistema.mostrarToast('Venta procesada exitosamente', 'success');
                    
                } catch (error) {
                    console.error('[V.I.E.R.N.E.S.] Error procesando venta:', error);
                    Sistema.mostrarToast('Error al procesar la venta', 'error');
                }
            },
            
            // Scanner QR
            iniciarScanner() {
                document.getElementById('modalScanner').classList.add('active');
                
                // Inicializar scanner (implementación básica)
                setTimeout(() => {
                    Sistema.mostrarToast('Escáner listo - Apunte al código QR', 'info');
                }, 500);
            },
            
            detenerScanner() {
                document.getElementById('modalScanner').classList.remove('active');
            },
            
            // Búsqueda
            buscarProductos(termino) {
                const container = document.getElementById('productGrid');
                if (!container) return;
                
                termino = termino.toLowerCase();
                
                const productosFiltrados = Sistema.estado.productos.filter(producto => {
                    return producto.name_p.toLowerCase().includes(termino) ||
                           (producto.id_p && producto.id_p.toLowerCase().includes(termino)) ||
                           (producto.categoria && producto.categoria.toLowerCase().includes(termino));
                });
                
                container.innerHTML = '';
                
                productosFiltrados.forEach(producto => {
                    const card = this.crearCardProducto(producto);
                    container.appendChild(card);
                });
            }
        };
        
        // ===== MÓDULO DE INVENTARIO =====
        const Inventario = {
            async cargarProductos() {
                try {
                    pb = new PocketBase('https://sisov-pro-react-production.up.railway.app');
                    const productos = await pb.collection('products').getFullList();
                    Sistema.estado.productos = productos;
                } catch (error) {
                    console.error('Error cargando productos:', error);
                    Sistema.mostrarToast('Error cargando productos', 'error');
                }
            },
            
            renderizarInventario() {
                const container = document.getElementById('inventoryTable');
                if (!container) return;
                
                container.innerHTML = '';
                
                Sistema.estado.productos.forEach(producto => {
                    const row = this.crearFilaProducto(producto);
                    container.appendChild(row);
                });
            },
            
            crearFilaProducto(producto) {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50';

                // Formateamos la fecha de creación que viene de PocketBase (created)
                const fechaRegistro = producto.created ? new Date(producto.created).toLocaleDateString() : '---';

                tr.innerHTML = `
                    <td class="p-4">
                        <div>
                            <h4 class="font-semibold text-slate-800">${producto.name_p}</h4>
                            <p class="text-xs text-slate-500">ID: ${producto.id_p || producto.id.slice(0, 8)}</p>
                        </div>
                    </td>
                    <td class="p-4">
                        <span class="font-mono text-sm">${producto.id_p || 'N/A'}</span>
                    </td>
                    <td class="p-4">
                        <span class="badge ${producto.stock > 10 ? 'badge-success' : producto.stock > 0 ? 'badge-warning' : 'badge-danger'}">
                            ${producto.stock} unidades
                        </span>
                    </td>
                    <td class="p-4">
                        <span class="text-sm text-slate-500 font-medium">${fechaRegistro}</span>
                    </td>
                    <td class="p-4">
                        <span class="font-bold text-slate-800">${Sistema.formatearMoneda(producto.price_usd)}</span>
                    </td>
                    <td class="p-4">
                        <span class="text-sm text-slate-600">${producto.category || 'General'}</span>
                    </td>
                    <td class="p-4">
                        <div class="flex gap-2">
                            <button onclick="Inventario.editarProducto('${producto.id}')" 
                                    class="p-2 text-primary hover:bg-primary hover:text-white rounded-lg transition-colors">
                                <i data-lucide="edit" class="w-4 h-4"></i>
                            </button>
                            <button onclick="Inventario.eliminarProducto('${producto.id}')" 
                                    class="p-2 text-danger hover:bg-danger hover:text-white rounded-lg transition-colors">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </td>
                `;
                
                return tr;
            },
            
            mostrarModalProducto(productoId = null) {
                const modal = document.getElementById('modalProducto');
                const title = document.getElementById('modalProductTitle');
                const form = document.getElementById('productForm');
                
                if (productoId) {
                    // Modo edición
                    const producto = Sistema.estado.productos.find(p => p.id === productoId);
                    if (producto) {
                        title.textContent = 'Editar Producto';
                        document.getElementById('productId').value = producto.id;
                        document.getElementById('productName').value = producto.name_p;
                        document.getElementById('productSKU').value = producto.id_p || '';
                        document.getElementById('productCategory').value = producto.category || '';
                        document.getElementById('productPrice').value = producto.price_usd;
                        document.getElementById('productStock').value = producto.stock;
                    }
                } else {
                    // Modo nuevo
                    title.textContent = 'Nuevo Producto';
                    form.reset();
                    document.getElementById('productId').value = '';
                }
                
                modal.classList.add('active');
            },
            
            cerrarModalProducto() {
                document.getElementById('modalProducto').classList.remove('active');
            },
            
            async guardarProducto(event) {
                event.preventDefault();
                
                try {
                    pb = new PocketBase('https://sisov-pro-react-production.up.railway.app');
                    
                    const productoData = {
                        name_p: document.getElementById('productName').value,
                        id_p: document.getElementById('productSKU').value,
                        category: document.getElementById('productCategory').value,
                        price_usd: parseFloat(document.getElementById('productPrice').value),
                        stock: parseInt(document.getElementById('productStock').value)
                    };
                    
                    const productoId = document.getElementById('productId').value;
                    
                    if (productoId) {
                        // Actualizar
                        await pb.collection('products').update(productoId, productoData);
                        Sistema.mostrarToast('Producto actualizado', 'success');
                    } else {
                        // Crear nuevo
                        await pb.collection('products').create(productoData);
                        Sistema.mostrarToast('Producto creado', 'success');
                    }
                    
                    // Recargar productos
                    await this.cargarProductos();
                    
                    // Actualizar UI
                    this.renderizarInventario();
                    Ventas.renderizarProductos();
                    
                    // Cerrar modal
                    this.cerrarModalProducto();
                    
                } catch (error) {
                    console.error('Error guardando producto:', error);
                    Sistema.mostrarToast('Error guardando producto', 'error');
                }
            },
            
            async eliminarProducto(productoId) {
                Swal.fire({
                    title: '¿Eliminar producto?',
                    text: 'Esta acción no se puede deshacer',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, eliminar',
                    cancelButtonText: 'Cancelar'
                }).then(async (result) => {
                    if (result.isConfirmed) {
                        try {
                            pb = new PocketBase('https://sisov-pro-react-production.up.railway.app');
                            await pb.collection('products').delete(productoId);
                            
                            // Actualizar estado local
                            Sistema.estado.productos = Sistema.estado.productos.filter(p => p.id !== productoId);
                            
                            // Actualizar UI
                            this.renderizarInventario();
                            Ventas.renderizarProductos();
                            
                            Sistema.mostrarToast('Producto eliminado', 'success');
                        } catch (error) {
                            Sistema.mostrarToast('Error eliminando producto', 'error');
                        }
                    }
                });
            },
            
            editarProducto(productoId) {
                this.mostrarModalProducto(productoId);
            },
            
            filtrarProductos(filtro) {
                let productosFiltrados = [...Sistema.estado.productos];
                
                switch(filtro) {
                    case 'bajo':
                        productosFiltrados = productosFiltrados.filter(p => p.stock > 0 && p.stock <= 10);
                        break;
                    case 'agotado':
                        productosFiltrados = productosFiltrados.filter(p => p.stock === 0);
                        break;
                }
                
                const container = document.getElementById('inventoryTable');
                if (!container) return;
                
                container.innerHTML = '';
                
                productosFiltrados.forEach(producto => {
                    const row = this.crearFilaProducto(producto);
                    container.appendChild(row);
                });
            },
            
            buscarEnInventario(termino) {
                const container = document.getElementById('inventoryTable');
                if (!container) return;
                
                termino = termino.toLowerCase();
                
                const productosFiltrados = Sistema.estado.productos.filter(producto => {
                    return producto.name_p.toLowerCase().includes(termino) ||
                           (producto.id_p && producto.id_p.toLowerCase().includes(termino)) ||
                           (producto.category && producto.category.toLowerCase().includes(termino));
                });
                
                container.innerHTML = '';
                
                productosFiltrados.forEach(producto => {
                    const row = this.crearFilaProducto(producto);
                    container.appendChild(row);
                });
            }
        };
        
        

        // ===== MÓDULO DE REPORTES (Optimizado y Corregido) =====
const Reportes = {
    chartInstancia: null, // Variable para controlar y destruir el gráfico previo
//=============================================================================================
    async cargarReportes() {
        // 1. Obtener la fecha del input o usar hoy por defecto
        let fechaSeleccionada = document.getElementById('reportDate').value;
        if (!fechaSeleccionada) {
            fechaSeleccionada = new Date().toISOString().split('T')[0];
            document.getElementById('reportDate').value = fechaSeleccionada;
        }

        console.log(`[REPORTES] Consultando histórico para: ${fechaSeleccionada}`);

        // 2. Ejecutar procesos en paralelo para mayor velocidad
        await Promise.all([
            this.cargarDatosVentas(fechaSeleccionada),
            this.cargarGraficoSemanal(fechaSeleccionada)
        ]);
    },

    async cargarDatosVentas(fecha) {
        try {
            // [Micro-cirugía: Definición de la variable faltante]
            // Si no viene fecha, usamos la del sistema sincronizada
            const fechaConsulta = fecha || Sistema.estado.config.serverTime.toISOString().split('T')[0];

            // Filtro dinámico: busca por el campo inmutable id_fecha
            const filtro = `id_fecha = "${fechaConsulta}"`;
            // const filtro = `created >= "${fecha} 00:00:00" && created <= "${fecha} 23:59:59"`;
            
            const ventas = await pb.collection('sales').getFullList({
                filter: filtro,
                sort: '-created',
                requestKey: null // <--- ESTO SOLUCIONA EL ERROR
            });

            // Actualizar Tarjetas de Resumen
            const totalUSD = ventas.reduce((sum, v) => sum + (v.total_usd || 0), 0);
            const totalVES = ventas.reduce((sum, v) => sum + (v.total_ves || 0), 0);

            document.getElementById('ventasHoyUSD').textContent = Sistema.formatearMoneda(totalUSD);
            document.getElementById('ventasHoyVES').textContent = Sistema.formatearMoneda(totalVES, 'VES');
            document.getElementById('transaccionesHoy').textContent = ventas.length;

            // Actualizar Tabla y Lista de Productos
            this.renderizarTabla(ventas);
            this.procesarTopProductos(ventas);

        } catch (error) {
            console.error('Error en cargarDatosVentas:', error);
            Sistema.mostrarToast('Error al cargar datos históricos', 'error');
        }
    },

    //tabladinamica de renderiza de inventario
    // --- DENTRO DE Reportes.renderizarTabla(ventas) ---   
    renderizarTabla(ventas) {
        const container = document.getElementById('salesTable');
        if (!container) return;
        
        if (ventas.length === 0) {
            container.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">Sin ventas registradas en esta fecha.</td></tr>`;
            return;
        }
    
        container.innerHTML = ventas.map(v => `
            <tr class="hover:bg-slate-50 border-b border-slate-100 transition-colors">
                <td class="p-4 font-mono text-xs font-bold text-slate-700">
                    ${v.n_factura || v.id.slice(0,8)}
                </td>
                <td class="p-4 text-sm text-slate-500">
                    ${new Date(v.created).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: true})}
                </td>
                
                <td class="p-4 text-sm">
                    <span class="px-2 py-1 rounded-lg font-bold text-[10px] uppercase ${this.obtenerColorPago(v.payment_method)}">
                        ${v.payment_method || 'EFECTIVO'}
                    </span>
                </td>
        
                <td class="p-4 text-base font-black text-emerald-600">
                    ${Sistema.formatearMoneda(v.total_usd)}
                </td>
                <td class="p-4 text-base font-black text-purple-600">
                    ${Sistema.formatearMoneda(v.total_ves, 'VES')}
                </td>
                <td class="p-4">
                    <div class="flex justify-center items-center">
                        <button onclick="Reportes.verDetalleVenta('${v.id}')" class="p-2 hover:bg-indigo-100 rounded-xl text-primary transition-all flex items-center justify-center border border-transparent hover:border-indigo-200">
                            <i data-lucide="eye" class="w-5 h-5"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
        lucide.createIcons();
    },
    
    //  FUNCIÓN de renderizarTabla para manejar los colores
    obtenerColorPago(metodo) {
        const colores = {
            'EFECTIVO': 'bg-emerald-100 text-emerald-700',
            'PAGO MOVIL': 'bg-blue-100 text-blue-700',
            'DEBITO': 'bg-cyan-100 text-cyan-700 border border-cyan-200', // <-- Nuevo color
            'ZELLE': 'bg-purple-100 text-purple-700',
            'TRANSFERENCIA': 'bg-slate-100 text-slate-700',
            'DIVISAS': 'bg-amber-100 text-amber-700'
        };
        return colores[metodo] || 'bg-slate-100 text-slate-700';
    },

    // logica del boton para descargar pdf 
   async exportarPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const fechaReporte = document.getElementById('reportDate').value || new Date().toISOString().split('T')[0];
        
        try {
            Sistema.mostrarToast('Generando informe profesional...', 'info');
            
            const filtro = `id_fecha = "${fechaReporte}"`;
            // const filtro = `created >= "${fechaReporte} 00:00:00" && created <= "${fechaReporte} 23:59:59"`;
            const ventas = await pb.collection('sales').getFullList({
                filter: filtro,
                sort: 'created',
                requestKey: null
            });

            if (ventas.length === 0) {
                Sistema.mostrarToast('No hay ventas en esta fecha', 'warning');
                return;
            }

            // --- PROCESAMIENTO DE DATOS ---
            const totalUSD = ventas.reduce((sum, v) => sum + v.total_usd, 0);
            const totalVES = ventas.reduce((sum, v) => sum + v.total_ves, 0);
            
            const resumenMetodos = ventas.reduce((acc, v) => {
                acc[v.payment_method] = (acc[v.payment_method] || 0) + v.total_usd;
                return acc;
            }, {});

            // Obtener el login actual
            const usuarioLogueado = pb.authStore.model ? pb.authStore.model.email : "Usuario";

            // --- DISEÑO DEL PDF ---
            
            // Encabezado principal
            doc.setFillColor(248, 250, 252);
            doc.rect(0, 0, 210, 40, 'F');
            
            doc.setTextColor(30, 41, 59);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(22);
            doc.text('SISOV PRO v3.0', 20, 20);
            
            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139);
            doc.text('SISTEMA DE GESTIÓN DE VENTAS E INVENTARIO', 20, 27);
            
            // EL ÚNICO CAMBIO ADICIONAL: Usuario donde lo pediste
            doc.setFont("helvetica", "normal");
            doc.text(`Usuario: ${usuarioLogueado}`, 20, 33);
            
            doc.setTextColor(30, 41, 59);
            doc.setFontSize(12);
            doc.text(`REPORTE DIARIO: ${fechaReporte}`, 190, 20, { align: 'right' });
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.text(`Generado: ${new Date().toLocaleString()}`, 190, 27, { align: 'right' });

            // --- SECCIÓN: RESUMEN FINANCIERO ---
            let currentY = 50;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text('1. RESUMEN GENERAL DE CAJA', 20, currentY);
            doc.line(20, currentY + 2, 190, currentY + 2);
            
            currentY += 12;
            doc.setDrawColor(226, 232, 240);
            doc.rect(20, currentY, 80, 25); 
            doc.rect(110, currentY, 80, 25); 

            doc.setFontSize(9);
            doc.text('TOTAL INGRESOS (USD)', 25, currentY + 7);
            doc.setFontSize(14);
            doc.setTextColor(16, 185, 129); 
            doc.text(`$ ${totalUSD.toFixed(2)}`, 25, currentY + 18);

            doc.setTextColor(30, 41, 59);
            doc.setFontSize(9);
            doc.text('TOTAL INGRESOS (VES)', 115, currentY + 7);
            doc.setFontSize(14);
            doc.setTextColor(126, 34, 206); 
            const formattedVES = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 }).format(totalVES);
            doc.text(`${formattedVES} Bs`, 115, currentY + 18);

            currentY += 35;
            doc.setTextColor(30, 41, 59);
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.text('DESGLOSE POR MÉTODO DE PAGO:', 20, currentY);
            
            doc.setFont("helvetica", "normal");
            Object.entries(resumenMetodos).forEach(([metodo, monto]) => {
                currentY += 7;
                doc.text(`• ${metodo}:`, 25, currentY);
                doc.text(`$ ${monto.toFixed(2)}`, 80, currentY, { align: 'right' });
            });

            // --- SECCIÓN: TABLA DETALLADA (Sin cambios de columnas) ---
            currentY += 15;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text('2. LISTADO DETALLADO DE OPERACIONES', 20, currentY);
            doc.line(20, currentY + 2, 190, currentY + 2);

            currentY += 10;
            doc.setFillColor(241, 245, 249);
            doc.rect(20, currentY, 170, 8, 'F');
            doc.setFontSize(8);
            doc.text('HORA', 22, currentY + 5);
            doc.text('FACTURA / ID', 40, currentY + 5);
            doc.text('MÉTODO', 85, currentY + 5);
            doc.text('TASA', 115, currentY + 5);
            doc.text('MONTO USD', 145, currentY + 5);
            doc.text('MONTO VES', 170, currentY + 5);

            currentY += 13;
            doc.setFont("helvetica", "normal");

            ventas.forEach((v) => {
                if (currentY > 275) { doc.addPage(); currentY = 20; }
                const hora = new Date(v.created).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const vesFila = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2 }).format(v.total_ves);
                
                doc.text(hora, 22, currentY);
                doc.text(v.n_factura || v.id.slice(0,10), 40, currentY);
                doc.text(v.payment_method, 85, currentY);
                doc.text(`${v.dolartoday || '0.00'}`, 115, currentY);
                doc.text(`$${v.total_usd.toFixed(2)}`, 145, currentY);
                doc.text(`${vesFila}`, 170, currentY);
                
                doc.setDrawColor(241, 245, 249);
                doc.line(20, currentY + 2, 190, currentY + 2);
                currentY += 7;
            });

            doc.setFontSize(8);
            doc.setTextColor(148, 163, 184);
            doc.text('*** FIN DEL REPORTE - DOCUMENTO PARA USO INTERNO ***', 105, 285, { align: 'center' });

            doc.save(`REPORTE_SISOV_${fechaReporte}.pdf`);
            Sistema.mostrarToast('Informe generado', 'success');
            
        } catch (error) {
            console.error('Error reporte:', error);
            Sistema.mostrarToast('Error al generar informe', 'error');
        }
    },
//=================================================================================
    
    procesarTopProductos(ventas) {
        const conteo = {};
        ventas.forEach(v => {
            if (v.items) {
                v.items.forEach(item => {
                    conteo[item.producto] = (conteo[item.producto] || 0) + item.cantidad;
                });
            }
        });

        const top = Object.entries(conteo).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const container = document.getElementById('topProducts');
        if (!container) return;

        container.innerHTML = top.length > 0 ? top.map(([nombre, cant], i) => `
            <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div class="flex items-center gap-3">
                    <span class="w-6 h-6 flex items-center justify-center bg-indigo-600 text-white text-[10px] font-bold rounded-md">${i+1}</span>
                    <span class="text-sm font-medium text-slate-700">${nombre}</span>
                </div>
                <span class="text-xs font-bold bg-white px-2 py-1 rounded shadow-sm text-indigo-600">${cant} uds.</span>
            </div>
        `).join('') : '<p class="text-center text-slate-400 py-4 text-xs">No hay productos vendidos</p>';
    },
//=============================================================================================
    async cargarGraficoSemanal(fechaRef) {
        try {
            const ctx = document.getElementById('salesChart');
            if (!ctx) return;

            // Limpiar instancia previa para evitar que se vuelva loco o crezca
            if (this.chartInstancia) {
                this.chartInstancia.destroy();
            }

            // Calcular rango de 7 días hacia atrás desde la fecha seleccionada
            const fechaFin = new Date(fechaRef);
            const fechaInicio = new Date(fechaRef);
            fechaInicio.setDate(fechaInicio.getDate() - 6);

            const ventas = await pb.collection('sales').getFullList({
                filter: `created >= "${fechaInicio.toISOString().split('T')[0]} 00:00:00" && created <= "${fechaFin.toISOString().split('T')[0]} 23:59:59"`,
                sort: 'created',
                requestKey: null // <--- ESTO EVITA QUE ESTA PETICIÓN CANCELE LA OTRA
            });

            // Agrupar datos por día
            const datosMap = {};
            for(let i=0; i<7; i++) {
                const d = new Date(fechaInicio);
                d.setDate(d.getDate() + i);
                datosMap[d.toLocaleDateString('es-ES', {weekday: 'short'})] = 0;
            }

            ventas.forEach(v => {
                const label = new Date(v.created).toLocaleDateString('es-ES', {weekday: 'short'});
                if(datosMap.hasOwnProperty(label)) datosMap[label] += v.total_usd;
            });

            // Crear nueva instancia//=============================================================================================
            this.chartInstancia = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: Object.keys(datosMap),
                    datasets: [{
                        label: 'Ventas USD',
                        data: Object.values(datosMap),
                        borderColor: '#4f46e5',
                        backgroundColor: 'rgba(79, 70, 229, 0.1)',
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 4,
                        pointBackgroundColor: '#4f46e5'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false, // <-- IMPORTANTE: Evita el crecimiento infinito
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { 
                            beginAtZero: true, 
                            ticks: { callback: (val) => '$' + val }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error en cargarGraficoSemanal:', error);
        }
    },

    // modal de facturacion //======================================================================================
    async verDetalleVenta(ventaId) {
        try {
            const venta = await pb.collection('sales').getOne(ventaId, { requestKey: null });
            
            // [Micro-cirugía: Inserción de lógica de fecha inmutable]
            const fechaMostrar = venta.id_fecha || new Date(venta.created).toLocaleString();
            
            Swal.fire({
                title: `Factura: ${venta.n_factura || venta.id}`,
                icon: 'info',
                html: `
                <div class="flex justify-center mb-6">
                    <button onclick="Reportes.generarPDFVenta('${venta.id}')" 
                            class="btn-pdf-notorio flex items-center justify-center gap-3 px-8 py-3 rounded-2xl text-white shadow-2xl transition-all active:scale-95">
                        <i data-lucide="file-down" class="w-6 h-6"></i>
                        <div class="text-left">
                            <span class="block text-[10px] uppercase font-black opacity-80 leading-none">Descargar Ahora</span>
                            <span class="text-lg font-bold leading-none">RECIBO PDF</span>
                        </div>
                    </button>
                </div>

                    <div class="text-left mt-4">
                        <p><strong>Fecha:</strong> ${fechaMostrar}</p>
                        <p><strong>Cliente:</strong> ${venta.user_email || 'test@test.com'}</p>
                        <p><strong>Método de pago:</strong> ${venta.payment_method}</p>
                        <hr class="my-3">
                        <p class="font-bold">Productos:</p>
                        <ul class="list-disc pl-4 mb-3">
                            ${venta.items ? (typeof venta.items === 'string' ? JSON.parse(venta.items) : venta.items).map(item => 
                                `<li>${item.producto} - ${item.cantidad} x ${Sistema.formatearMoneda(item.precio_unitario)}</li>`
                            ).join('') : '<li>Sin productos</li>'}
                        </ul>
                        <hr class="my-3">
                        <p><strong>Total USD:</strong> ${Sistema.formatearMoneda(venta.total_usd)}</p>
                        <p><strong>Total Bs:</strong> ${Sistema.formatearMoneda(venta.total_ves, 'VES')}</p>
                        <p><strong>Tasa BCV:</strong> ${venta.dolartoday || '382.63'}</p>
                    </div>
                `,
                confirmButtonText: 'Cerrar',
                didOpen: () => lucide.createIcons() // Necesario para que el icono del botón PDF cargue
            });
            
        } catch (error) {
            console.error('Error:', error);
        }
    },
//=============================================================================================

    // Nueva función para generar el PDF con estilo de factura
    
    async generarPDFVenta(id) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: [80, 160] }); 
        
        try {
            const v = await pb.collection('sales').getOne(id);
            
            // --- Cabecera Limpia (Sin fondos oscuros) ---
            doc.setTextColor(0, 0, 0);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text('SISOV PRO v3.0', 40, 10, { align: 'center' });
            
            // Línea doble decorativa fina (consume mínima tinta)
            doc.setLineWidth(0.1);
            doc.line(5, 12, 75, 12);
            doc.line(5, 13, 75, 13);
            
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.text(`Factura: ${v.n_factura || v.id.toUpperCase()}`, 10, 22);
            doc.text(`Fecha: ${new Date(v.created).toLocaleString()}`, 10, 27);
            doc.text(`Cliente: ${v.user_email || 'Mostrador'}`, 10, 32);
            
            // Separador punteado o línea simple fina
            doc.setDrawColor(200, 200, 200);
            doc.line(5, 37, 75, 37);
            
            // --- Listado de Productos ---
            let y = 43;
            doc.setFont("helvetica", "bold");
            doc.text('CANT.   DESCRIPCIÓN', 10, y);
            doc.text('TOTAL', 70, y, { align: 'right' });
            y += 4;
            
            doc.setFont("helvetica", "normal");
            v.items.forEach(item => {
                doc.text(`${item.cantidad}x`, 10, y);
                doc.text(`${item.producto.substring(0,22)}`, 20, y);
                doc.text(`$${(item.cantidad * item.precio_unitario).toFixed(2)}`, 70, y, { align: 'right' });
                y += 5;
            });
            
            // --- Totales y Tasa ---
            doc.line(5, y + 2, 75, y + 2);
            y += 8;
            
            doc.setFontSize(7);
            doc.text(`TASA REF. BCV: ${v.dolartoday || 'N/A'} Bs/$`, 10, y);
            
            y += 6;
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.text(`TOTAL USD:`, 10, y);
            doc.text(`$${v.total_usd.toFixed(2)}`, 70, y, { align: 'right' });
            
            y += 6;
            doc.text(`TOTAL BS:`, 10, y);
            doc.text(`${v.total_ves.toLocaleString('es-VE', {minimumFractionDigits: 2})} Bs`, 70, y, { align: 'right' });
            
            // --- Pie de Factura ---
            y += 15;
            doc.setFontSize(7);
            doc.setFont("helvetica", "italic");
            doc.text('Comprobante de Pago Digital', 40, y, { align: 'center' });
            doc.text('No representa factura fiscal', 40, y + 4, { align: 'center' });
            doc.text('*** Gracias por su Compra ***', 40, y + 10, { align: 'center' });

            doc.save(`Factura_${v.n_factura || v.id}.pdf`);
            Sistema.mostrarToast('PDF generado (Modo Ahorro)', 'success');
        } catch (e) {
            console.error('Error PDF:', e);
            Sistema.mostrarToast('Error al generar PDF', 'error');
        }
    }
 
};
//=============================================================================================
        
        // ===== MÓDULO DE CONFIGURACIÓN =====
        const Configuracion = {
            async actualizarTasa() {
                const input = document.getElementById('newRate');
                const tasa = parseFloat(input.value);
                
                if (tasa && tasa > 0) {
                    Sistema.estado.tasaBCV = tasa;
                    Sistema.estado.config.tasaManual = true;
                    Sistema.actualizarTasaUI();
                    Sistema.mostrarToast('Tasa actualizada correctamente', 'success');
                    input.value = '';
                } else {
                    Sistema.mostrarToast('Ingrese una tasa válida', 'error');
                }
            },
          //funcion para cargar los usuarios  
          async cargarUsuarios() {
            try {
            pb = new PocketBase('https://sisov-pro-react-production.up.railway.app');
            const usuarios = await pb.collection('users').getFullList();
            
            const container = document.getElementById('usersList');
            container.innerHTML = '';
            
            usuarios.forEach(usuario => {
            const userDiv = document.createElement('div');
                userDiv.className = 'flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200';
                userDiv.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-gradient-to-br from-primary to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                            ${usuario.user_name?.charAt(0) || usuario.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h4 class="font-semibold text-slate-800">${usuario.user_name || 'Sin nombre'}</h4>
                            <p class="text-sm text-slate-500">${usuario.email}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="badge ${usuario.user_role === 'admin' ? 'badge-danger' : usuario.user_role === 'vendedor' ? 'badge-warning' : 'badge-success'}">
                            ${usuario.user_role || 'user'}
                        </span>
                        <span class="text-xs ${usuario.verified ? 'text-emerald-600' : 'text-amber-600'}">
                            ${usuario.verified ? '✓ Verificado' : '⏳ Pendiente'}
                        </span>
                    </div>
                `;
                container.appendChild(userDiv);
            });
            
            Sistema.mostrarToast('Usuarios cargados', 'success');
        } catch (error) {
            console.error('Error cargando usuarios:', error);
            Sistema.mostrarToast('Error cargando usuarios', 'error');
        }
    }
};
        
    // ===== INICIALIZACIÓN (VERSIÓN CON PERSISTENCIA F5) =====
        document.addEventListener('DOMContentLoaded', async () => {
        console.log("%c[SISTEMA] Iniciando recuperación de núcleo...", "color: #4f46e5; font-weight: bold;");


                        Sistema.activarVentasManual = function(elemento) {
                // 1. Ejecutar el cambio de pestaña original
                this.cambiarTab('ventas');
                        
                // 2. Desactivar el efecto visual llamativo
                elemento.classList.remove('tab-atencion');
                        
                // 3. FORZAR RENDERIZADO de productos e inventario
                console.log("%c[ACCION] Activando renderizado manual de productos...", "color: #10b981; font-weight: bold;");
                        
                if (window.Inventario && window.Inventario.cargarProductos) {
                    window.Inventario.cargarProductos();
                }

                if (window.Reportes && window.Reportes.cargarEstadisticas) {
                    window.Reportes.cargarEstadisticas();
                }
            };
            
            // 1. Persistencia Inmediata: Exponer objetos al window antes de cualquier await
            window.Sistema = Sistema;
            window.Ventas = Ventas;
            window.Inventario = Inventario;
            window.Reportes = Reportes;
            window.Configuracion = Configuracion;

            //iniciacion de reporte 
            // Micro-cirugía: Vincular el buscador de fecha a la carga de reportes
            const reportInput = document.getElementById('reportDate');
            if (reportInput) {
                reportInput.addEventListener('change', () => {
                    Reportes.cargarReportes();
                });
            }

            // 2. Inicializar Instancia de PocketBase de forma global y persistente
            try {
                window.pb = new PocketBase('https://sisov-pro-react-production.up.railway.app');
                console.log("[POCKETBASE] Instancia vinculada correctamente");
            } catch (e) {
                console.error("[ERROR] Fallo al instanciar PocketBase", e);
            }

            // 3. Configurar Listeners de UI (Sin alterar IDs ni onclicks)
            document.getElementById('productForm')?.addEventListener('submit', (e) => Inventario.guardarProducto(e));
            document.getElementById('searchProducts')?.addEventListener('input', (e) => Ventas.buscarProductos(e.target.value));
            document.getElementById('searchInventory')?.addEventListener('input', (e) => Inventario.buscarEnInventario(e.target.value));
            
            const reportDate = document.getElementById('reportDate');
            if (reportDate) {
                const hoy = new Date().toISOString().split('T')[0];
                reportDate.value = hoy;
                reportDate.max = hoy;

                // Micro-cirugía: Listener para actualizar tabla de reportes al cambiar fecha
                reportDate.addEventListener('change', (e) => {
                    if (window.Reportes && window.Reportes.cargarEstadisticas) {
                        window.Reportes.cargarEstadisticas(e.target.value);
                    }
                });
            }
            
            // 4. Lógica de recuperación post-F5
            try {

                // NUEVA INSERCIÓN: Sincronizamos la hora oficial antes de cargar datos(11/02/2026)
                // await Sistema.actualizarHoraServidor();
                // Verificar sesión existente en el authStore
                await Sistema.inicializar(); 
                
                // Si la sesión es válida, forzar la hidratación de datos inmediatamente
                if (window.pb && window.pb.authStore.isValid) {
                    console.log("[NÚCLEO] Sesión detectada. Hidratando tablas de Inventario y Reportes...");
                    
                    // Verificación de salud del servidor
                    await window.pb.health.check();
                    
                    // Ejecutar cargas críticas en paralelo para que el renderizado sea veloz
                    const fechaActual = reportDate?.value || new Date().toISOString().split('T')[0];
                    
                    await Promise.all([
                        typeof Inventario.cargarProductos === 'function' ? Inventario.cargarProductos() : Promise.resolve(),
                        typeof Reportes.cargarEstadisticas === 'function' ? Reportes.cargarEstadisticas(fechaActual) : Promise.resolve()
                    ]);
                    
                    const statusEl = document.getElementById('serverStatus');
                    if (statusEl) {
                        statusEl.textContent = 'Conectado / Datos Sincronizados';
                        statusEl.classList.remove('text-red-500');
                        statusEl.classList.add('text-emerald-500');
                    }
                }
            } catch (error) {
                console.error("[ERROR] Fallo en recuperación inicial:", error);
                const statusEl = document.getElementById('serverStatus');
                if (statusEl) {
                    statusEl.textContent = 'Error de Enlace';
                    statusEl.classList.add('text-red-500');
                }
            }
            
            // 5. Finalizar UI y Mantenimiento
            if (typeof Ventas.seleccionarMetodoPago === 'function') {
                Ventas.seleccionarMetodoPago('EFECTIVO');
            }
            
            lucide.createIcons();
            
            // Actualización de iconos cada segundo para elementos dinámicos
            setInterval(() => {
                if (window.lucide) lucide.createIcons();
            }, 1000);
            
            console.log("%c[NÚCLEO] Sistema listo y persistente", "color: #10b981; font-weight: bold;");
        });

        // Garantizar exposición global al final del script
        window.Sistema = Sistema;
        window.Ventas = Ventas;
        window.Inventario = Inventario;
        window.Reportes = Reportes;
        window.Configuracion = Configuracion;

        console.log("%c[NÚCLEO] Comunicación global activada", "color: #3b82f6; font-weight: bold;");