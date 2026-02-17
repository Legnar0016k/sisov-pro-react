//======================================================//
//======================VENTAS.JS=========================//
//======================================================//

const Ventas = {
    carrito: [],
    metodoPago: 'EFECTIVO',
    
    // Sistema de cola para actualizaciones de stock
    colaActualizaciones: new Map(), // productoId -> { cambiosPendientes, timeout }
    TIEMPO_DEBOUNCE: 500, // milisegundos para agrupar cambios
    ACTUALIZACION_EN_CURSO: false,

    // ===== NUEVO: Persistencia del carrito =====
    
    // Cargar carrito desde localStorage al iniciar
    cargarCarritoPersistente() {
        try {
            const carritoGuardado = localStorage.getItem('sisov_carrito');
            if (carritoGuardado) {
                const carritoData = JSON.parse(carritoGuardado);
                
                // Verificar que los productos aún existen en el estado
                if (window.Sistema && window.Sistema.estado.productos.length > 0) {
                    // Reconstruir el carrito con los productos actuales
                    this.carrito = carritoData
                        .map(item => {
                            const producto = window.Sistema.estado.productos.find(p => p.id === item.productoId);
                            if (producto) {
                                return {
                                    producto: producto,
                                    cantidad: item.cantidad
                                };
                            }
                            return null;
                        })
                        .filter(item => item !== null);
                    
                    console.log(`[VENTAS] Carrito restaurado: ${this.carrito.length} productos`);
                }
            }
        } catch (error) {
            console.error('[VENTAS] Error cargando carrito persistente:', error);
        }
    },

    // Guardar carrito en localStorage
    guardarCarritoPersistente() {
        try {
            const carritoData = this.carrito.map(item => ({
                productoId: item.producto.id,
                cantidad: item.cantidad
            }));
            localStorage.setItem('sisov_carrito', JSON.stringify(carritoData));
        } catch (error) {
            console.error('[VENTAS] Error guardando carrito persistente:', error);
        }
    },

    // Limpiar carrito persistente (al finalizar venta)
    limpiarCarritoPersistente() {
        localStorage.removeItem('sisov_carrito');
    },

    async cargarProductosVenta() {
        return window.Sistema.estado.productos;
    },
    
    renderizarProductos() {
        const container = document.getElementById('productGrid');
        if (!container) return;
        
        container.innerHTML = '';
        
        window.Sistema.estado.productos.forEach(producto => {
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
                    <span class="text-lg font-bold text-primary">${window.Sistema.formatearMoneda(producto.price_usd)}</span>
                    <p class="text-xs text-slate-500">${(producto.price_usd * window.Sistema.estado.tasaBCV).toFixed(2)} Bs</p>
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
    
    // ===== SISTEMA DE ACTUALIZACIÓN DE STOCK EN TIEMPO REAL =====
    
    // Agregar cambio de stock a la cola
    encolarActualizacion(productoId, cambio) {
        if (!this.colaActualizaciones.has(productoId)) {
            this.colaActualizaciones.set(productoId, {
                cambiosPendientes: 0,
                timeout: null
            });
        }
        
        const entrada = this.colaActualizaciones.get(productoId);
        entrada.cambiosPendientes += cambio;
        
        // Limpiar timeout anterior
        if (entrada.timeout) {
            clearTimeout(entrada.timeout);
        }
        
        // Programar nueva actualización
        entrada.timeout = setTimeout(() => {
            this.ejecutarActualizacion(productoId);
        }, this.TIEMPO_DEBOUNCE);
        
        console.log(`[VENTAS] Cambio encolado para ${productoId}: ${cambio} (pendiente: ${entrada.cambiosPendientes})`);
    },
    
    // Ejecutar la actualización pendiente
    async ejecutarActualizacion(productoId) {
        if (this.ACTUALIZACION_EN_CURSO) {
            console.log("[VENTAS] Actualización en curso, reprogramando...");
            setTimeout(() => this.ejecutarActualizacion(productoId), 100);
            return;
        }
        
        const entrada = this.colaActualizaciones.get(productoId);
        if (!entrada || entrada.cambiosPendientes === 0) {
            this.colaActualizaciones.delete(productoId);
            return;
        }
        
        this.ACTUALIZACION_EN_CURSO = true;
        
        try {
            const producto = window.Sistema.estado.productos.find(p => p.id === productoId);
            if (!producto) return;
            
            const nuevoStock = producto.stock + entrada.cambiosPendientes;
            
            // Validar que el stock no sea negativo
            if (nuevoStock < 0) {
                console.error("[VENTAS] Stock no puede ser negativo, revirtiendo cambio local");
                this.revertirCambioLocal(productoId, entrada.cambiosPendientes);
                return;
            }
            
            console.log(`[VENTAS] Actualizando stock de ${producto.name_p}: ${producto.stock} → ${nuevoStock} (cambio: ${entrada.cambiosPendientes})`);
            
            // Actualizar en PocketBase
            await window.pb.collection('products').update(productoId, {
                stock: nuevoStock
            });
            
            // Actualizar en memoria local
            producto.stock = nuevoStock;
            
            // Actualizar UI
            this.renderizarProductos();
            if (window.Inventario) window.Inventario.renderizarInventario();
            
            // Registrar en logs
            await window.pb.collection('system_logs').create({
                type: 'AJUSTE_STOCK_CARRITO',
                message: `Stock ajustado por carrito: ${producto.name_p} ${entrada.cambiosPendientes > 0 ? '+' : ''}${entrada.cambiosPendientes}`,
                user: window.Sistema.estado.usuario?.email || 'sistema',
                context: {
                    producto_id: productoId,
                    producto_nombre: producto.name_p,
                    cambio: entrada.cambiosPendientes,
                    stock_nuevo: nuevoStock
                }
            });
            
        } catch (error) {
            console.error('[VENTAS] Error actualizando stock:', error);
            window.Sistema.mostrarToast('Error al actualizar stock', 'error');
            
            // Revertir cambio local
            this.revertirCambioLocal(productoId, entrada.cambiosPendientes);
            
        } finally {
            this.colaActualizaciones.delete(productoId);
            this.ACTUALIZACION_EN_CURSO = false;
        }
    },
    
    revertirCambioLocal(productoId, cambio) {
        const producto = window.Sistema.estado.productos.find(p => p.id === productoId);
        if (producto) {
            producto.stock -= cambio; // Revertir
        }
        this.renderizarProductos();
        if (window.Inventario) window.Inventario.renderizarInventario();
    },
    
    // ===== FUNCIONES DEL CARRITO =====
    
    agregarAlCarrito(productoId) {
        const producto = window.Sistema.estado.productos.find(p => p.id === productoId);
        if (!producto) return;
        
        // Verificar stock
        if (producto.stock <= 0) {
            window.Sistema.mostrarToast('Producto sin stock', 'error');
            return;
        }
        
        // Buscar si ya está en el carrito
        const itemIndex = this.carrito.findIndex(item => item.producto.id === productoId);
        
        if (itemIndex >= 0) {
            // Verificar stock antes de incrementar
            if (this.carrito[itemIndex].cantidad < producto.stock) {
                this.carrito[itemIndex].cantidad++;
                
                // Encolar actualización de stock (restar 1)
                this.encolarActualizacion(productoId, -1);
            } else {
                window.Sistema.mostrarToast('No hay suficiente stock', 'error');
                return;
            }
        } else {
            // Agregar nuevo item
            this.carrito.push({
                producto: producto,
                cantidad: 1
            });
            
            // Encolar actualización de stock (restar 1)
            this.encolarActualizacion(productoId, -1);
        }
        
        this.actualizarCarritoUI();
        this.guardarCarritoPersistente(); // ← Guardar en localStorage
        window.Sistema.mostrarToast('Producto agregado al carrito', 'success');
    },
    
    removerDelCarrito(index) {
        const item = this.carrito[index];
        if (!item) return;
        
        // Devolver stock (encolar actualización)
        this.encolarActualizacion(item.producto.id, item.cantidad);
        
        // Eliminar del carrito
        this.carrito.splice(index, 1);
        
        this.actualizarCarritoUI();
        this.guardarCarritoPersistente(); // ← Guardar en localStorage
        window.Sistema.mostrarToast('Producto removido', 'info');
    },
    
    actualizarCantidad(index, nuevaCantidad) {
        const item = this.carrito[index];
        if (!item) return;
        
        const diferencia = nuevaCantidad - item.cantidad;
        
        if (nuevaCantidad < 1) {
            this.removerDelCarrito(index);
            return;
        }
        
        // Verificar stock disponible para incrementos
        if (diferencia > 0) {
            const producto = item.producto;
            if (nuevaCantidad > producto.stock + item.cantidad) {
                window.Sistema.mostrarToast(`Solo hay ${producto.stock + item.cantidad} unidades disponibles`, 'error');
                return;
            }
        }
        
        // Actualizar cantidad
        item.cantidad = nuevaCantidad;
        
        // Encolar actualización de stock
        if (diferencia !== 0) {
            this.encolarActualizacion(item.producto.id, -diferencia);
        }
        
        this.actualizarCarritoUI();
        this.guardarCarritoPersistente(); // ← Guardar en localStorage
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
        
        const totalVES = subtotalUSD * window.Sistema.estado.tasaBCV;
        
        // Actualizar elementos
        subtotalElement.textContent = window.Sistema.formatearMoneda(subtotalUSD);
        totalElement.textContent = window.Sistema.formatearMoneda(totalVES, 'VES');
        
        // Habilitar/deshabilitar botón (considerando licencia)
        const licenciaActiva = window.GestionLicencias?.licenciaActual?.estado === 'activa';
        procesarBtn.disabled = this.carrito.length === 0 || !licenciaActiva;
        
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
                    <p class="text-xs text-slate-500">${window.Sistema.formatearMoneda(item.producto.price_usd)} c/u</p>
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
        
        // Refrescar iconos
        if (window.lucide) lucide.createIcons();
    },
    
    // ===== MÉTODOS EXISTENTES (ACTUALIZADOS) =====
    
    seleccionarMetodoPago(metodo) {
        this.metodoPago = metodo;
        
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
            text: 'Se devolverá todo el stock al inventario',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, vaciar',
            cancelButtonText: 'Cancelar'
        }).then((result) => {
            if (result.isConfirmed) {
                // Devolver todo el stock
                this.carrito.forEach(item => {
                    this.encolarActualizacion(item.producto.id, item.cantidad);
                });
                
                this.carrito = [];
                this.actualizarCarritoUI();
                this.limpiarCarritoPersistente(); // ← Limpiar localStorage
                window.Sistema.mostrarToast('Carrito vaciado, stock devuelto', 'info');
            }
        });
    },
    
    async procesarVenta() {
        if (this.carrito.length === 0) {
            window.Sistema.mostrarToast('El carrito está vacío', 'error');
            return;
        }
        
        // Verificar licencia activa
        const licenciaActiva = window.GestionLicencias?.licenciaActual?.estado === 'activa';
        if (!licenciaActiva) {
            window.Sistema.mostrarToast('Licencia suspendida - No se pueden procesar ventas', 'error');
            return;
        }
        
        // Verificar que todas las actualizaciones de stock estén completas
        if (this.colaActualizaciones.size > 0) {
            window.Sistema.mostrarToast('Esperando confirmación de stock...', 'warning');
            
            // Esperar a que se completen las actualizaciones pendientes
            await new Promise(resolve => {
                const check = setInterval(() => {
                    if (this.colaActualizaciones.size === 0 && !this.ACTUALIZACION_EN_CURSO) {
                        clearInterval(check);
                        resolve();
                    }
                }, 100);
            });
        }
        
        // Verificar stock final
        for (const item of this.carrito) {
            if (item.cantidad > item.producto.stock) {
                window.Sistema.mostrarToast(`Stock insuficiente de ${item.producto.name_p}`, 'error');
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
        return (this.calcularTotalUSD() * window.Sistema.estado.tasaBCV).toFixed(2);
    },
    
    async registrarVenta() {
        try {
            const pb = window.pb;
            
            const fechaInmutable = window.Sistema.estado.config.serverTime.toISOString().split('T')[0];

            const ventaData = {
                user_id: window.Sistema.estado.usuario.id,
                user_email: window.Sistema.estado.usuario.email,
                user_role: window.Sistema.estado.usuario.rol,
                n_factura: `FAC-${Date.now().toString().slice(-6)}`,
                dolartoday: window.Sistema.estado.tasaBCV,
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
                id_fecha: fechaInmutable 
            };
            
            await pb.collection('sales').create(ventaData);
            
            // Registrar en logs
            await pb.collection('system_logs').create({
                type: 'VENTA',
                message: `Venta procesada por ${window.Sistema.estado.usuario.nombre || window.Sistema.estado.usuario.email}`,
                user: window.Sistema.estado.usuario.email,
                context: {
                    factura: ventaData.n_factura,
                    total_usd: ventaData.total_usd,
                    items_count: this.carrito.length,
                    fecha_id: fechaInmutable
                }
            });
            
            // Limpiar carrito
            this.carrito = [];
            this.actualizarCarritoUI();
            this.limpiarCarritoPersistente(); // ← Limpiar localStorage
            
            // Actualizar UI de productos
            this.renderizarProductos();
            
            window.Sistema.mostrarToast('Venta procesada exitosamente', 'success');
            
        } catch (error) {
            console.error('[VENTAS] Error procesando venta:', error);
            window.Sistema.mostrarToast('Error al procesar la venta', 'error');
        }
    },
    
    iniciarScanner() {
        document.getElementById('modalScanner').classList.add('active');
        setTimeout(() => {
            window.Sistema.mostrarToast('Escáner listo - Apunte al código QR', 'info');
        }, 500);
    },
    
    detenerScanner() {
        document.getElementById('modalScanner').classList.remove('active');
    },
    
    buscarProductos(termino) {
        const container = document.getElementById('productGrid');
        if (!container) return;
        
        termino = termino.toLowerCase();
        
        const productosFiltrados = window.Sistema.estado.productos.filter(producto => {
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

// Exponer globalmente
window.Ventas = Ventas;

// Auto-ejecutar al cargar el script
(function() {
    // Esperar a que Sistema esté listo
    const checkSistema = setInterval(() => {
        if (window.Sistema && window.Sistema.estado.productos.length > 0) {
            clearInterval(checkSistema);
            Ventas.cargarCarritoPersistente();
            Ventas.actualizarCarritoUI();
        }
    }, 100);
})();