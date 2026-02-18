/**
 * @file ventas.js
 * @description Módulo de ventas con reserva de stock y manejo de concurrencia.
 * [REFACTOR] Depende de AuthSecurity para verificar licencia.
 */

const Ventas = {
    _metodoPago: 'EFECTIVO',
    _procesandoVenta: false,
    
    get carrito() {
        return window.Sistema.estado.carrito;
    },
    
    set carrito(nuevoCarrito) {
        window.Sistema.estado.carrito = nuevoCarrito;
        this.guardarCarritoPersistente();
        this.actualizarCarritoUI();
        
        if (window.CONFIG) {
            window.Sistema.emitirEvento(window.CONFIG.EVENTOS.CARRITO_CAMBIADO, {
                items: nuevoCarrito.length,
                total: this.calcularTotalUSD()
            });
        }
    },
    
    // ======================================================
    // PERSISTENCIA DEL CARRITO
    // ======================================================
    
    cargarCarritoPersistente() {
        try {
            const storageKey = window.CONFIG?.STORAGE_KEYS?.CARRITO || 'sisov_carrito';
            const carritoGuardado = localStorage.getItem(storageKey);
            if (!carritoGuardado) return;
            
            const carritoData = JSON.parse(carritoGuardado);
            
            if (!window.Sistema.estado.productos.length) {
                console.warn("[VENTAS] Productos no cargados, difiriendo restauración");
                setTimeout(() => this.cargarCarritoPersistente(), 1000);
                return;
            }
            
            const carritoReconstruido = carritoData
                .map(item => {
                    const producto = window.Sistema.estado.productos.find(p => p.id === item.productoId);
                    if (producto && producto.stock >= item.cantidad) {
                        return { producto: producto, cantidad: item.cantidad };
                    }
                    return null;
                })
                .filter(item => item !== null);
            
            if (carritoReconstruido.length !== carritoData.length) {
                console.warn("[VENTAS] Algunos productos del carrito ya no están disponibles");
            }
            
            window.Sistema.estado.carrito = carritoReconstruido;
            this.actualizarCarritoUI();
            
        } catch (error) {
            window.Sistema.manejarError('cargar_carrito', error, false);
            const storageKey = window.CONFIG?.STORAGE_KEYS?.CARRITO || 'sisov_carrito';
            localStorage.removeItem(storageKey);
        }
    },
    
    guardarCarritoPersistente() {
        try {
            const storageKey = window.CONFIG?.STORAGE_KEYS?.CARRITO || 'sisov_carrito';
            const carritoData = this.carrito.map(item => ({
                productoId: item.producto.id,
                cantidad: item.cantidad,
                timestamp: Date.now()
            }));
            localStorage.setItem(storageKey, JSON.stringify(carritoData));
        } catch (error) {
            window.Sistema.manejarError('guardar_carrito', error, false);
        }
    },
    
    // ======================================================
    // OPERACIONES DEL CARRITO
    // ======================================================
    
    async agregarAlCarrito(productoId) {
        const producto = window.Sistema.estado.productos.find(p => p.id === productoId);
        if (!producto) { window.Sistema.mostrarToast('Producto no encontrado', 'error'); return; }
        if (producto.stock <= 0) { window.Sistema.mostrarToast('Producto sin stock', 'error'); return; }

        const itemIndex = this.carrito.findIndex(item => item.producto.id === productoId);
        
        try {
            if (itemIndex >= 0) {
                const item = this.carrito[itemIndex];
                if (item.cantidad < producto.stock) {
                    await window.Sistema.ajustarStock(productoId, -1, 'reserva_carrito_incremento', { operacion: 'incrementar_carrito' });
                    this.carrito = this.carrito.map((item, idx) => idx === itemIndex ? { ...item, cantidad: item.cantidad + 1 } : item);
                    window.Sistema.mostrarToast('Producto agregado (+1)', 'success');
                } else {
                    window.Sistema.mostrarToast(`Solo hay ${producto.stock} disponibles`, 'warning');
                }
            } else {
                await window.Sistema.ajustarStock(productoId, -1, 'reserva_carrito_nuevo', { operacion: 'agregar_carrito' });
                this.carrito = [...this.carrito, { producto: producto, cantidad: 1 }];
                window.Sistema.mostrarToast('Producto agregado', 'success');
            }
        } catch (error) {
            if (error.message.includes('Stock insuficiente')) {
                window.Sistema.mostrarToast('No hay stock disponible en este momento', 'error');
            } else {
                window.Sistema.manejarError('agregar_al_carrito', error);
            }
        }
    },
    
    async removerDelCarrito(index) {
        const item = this.carrito[index];
        if (!item) return;
        try {
            await window.Sistema.ajustarStock(item.producto.id, item.cantidad, 'devolucion_carrito', { operacion: 'remover_carrito', cantidad: item.cantidad });
            this.carrito = this.carrito.filter((_, i) => i !== index);
            window.Sistema.mostrarToast('Producto removido, stock devuelto', 'info');
        } catch (error) {
            window.Sistema.manejarError('remover_carrito', error);
            this.carrito = this.carrito.filter((_, i) => i !== index);
            window.Sistema.mostrarToast('Producto removido (error devolviendo stock)', 'warning');
        }
    },
    
    async actualizarCantidad(index, nuevaCantidad) {
        const item = this.carrito[index];
        if (!item) return;
        if (nuevaCantidad < 1) { await this.removerDelCarrito(index); return; }

        const diferencia = nuevaCantidad - item.cantidad;
        
        try {
            if (diferencia > 0) {
                const producto = item.producto;
                if (nuevaCantidad > producto.stock + item.cantidad) {
                    window.Sistema.mostrarToast(`Solo hay ${producto.stock + item.cantidad} disponibles`, 'warning');
                    return;
                }
                await window.Sistema.ajustarStock(item.producto.id, -diferencia, 'reserva_carrito_actualizacion', { operacion: 'incrementar_cantidad', diferencia });
            } else if (diferencia < 0) {
                await window.Sistema.ajustarStock(item.producto.id, -diferencia, 'devolucion_carrito_actualizacion', { operacion: 'decrementar_cantidad', devolucion: -diferencia });
            }
            this.carrito = this.carrito.map((item, idx) => idx === index ? { ...item, cantidad: nuevaCantidad } : item);
        } catch (error) {
            window.Sistema.manejarError('actualizar_cantidad', error);
        }
    },
    
    async vaciarCarrito() {
        if (this.carrito.length === 0) return;
        const confirmacion = await Swal.fire({ title: '¿Vaciar carrito?', text: 'Se devolverá todo el stock al inventario', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, vaciar', cancelButtonText: 'Cancelar' });
        if (!confirmacion.isConfirmed) return;
        try {
            const ajustes = this.carrito.map(item => ({ productoId: item.producto.id, cantidad: item.cantidad, critical: false, metadata: { operacion: 'vaciar_carrito', cantidad: item.cantidad } }));
            await window.Sistema.ajusteStockMultiple(ajustes, 'vaciar_carrito');
            this.carrito = [];
            window.Sistema.mostrarToast('Carrito vaciado, stock devuelto', 'info');
        } catch (error) {
            window.Sistema.manejarError('vaciar_carrito', error);
            window.Sistema.mostrarToast('Error al devolver stock', 'error');
        }
    },
    
    // ======================================================
    // PROCESAMIENTO DE VENTA
    // ======================================================
    
    async procesarVenta() {
        if (this._procesandoVenta) { window.Sistema.mostrarToast('Ya hay una venta en proceso', 'warning'); return; }
        if (this.carrito.length === 0) { window.Sistema.mostrarToast('El carrito está vacío', 'error'); return; }

        // [REFACTOR] Verificar licencia activa desde AuthSecurity
        if (!window.AuthSecurity?.licenciaEsActiva) {
            window.Sistema.mostrarToast('Licencia no activa', 'error');
            return;
        }

        const confirmacion = await Swal.fire({ title: 'Confirmar Venta', html: this.generarResumenVenta(), icon: 'question', showCancelButton: true, confirmButtonText: 'Procesar Venta', cancelButtonText: 'Cancelar', confirmButtonColor: '#4f46e5', width: 500 });
        if (!confirmacion.isConfirmed) return;

        this._procesandoVenta = true;
        try {
            await this.ejecutarVenta();
        } catch (error) {
            window.Sistema.manejarError('procesar_venta', error);
        } finally {
            this._procesandoVenta = false;
        }
    },
    
    async ejecutarVenta() {
        const tx = window.Sistema.iniciarTransaccion('venta', 30000);
        
        try {
            for (const item of this.carrito) {
                const productoActual = window.Sistema.estado.productos.find(p => p.id === item.producto.id);
                if (!productoActual || item.cantidad > productoActual.stock) {
                    throw new Error(`Stock insuficiente para ${item.producto.name_p}. Stock actual: ${productoActual?.stock || 0}`);
                }
            }
            
            const fechaInmutable = window.Sistema.estado.config.serverTime?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0];
            
            const ventaData = {
                user_id: window.Sistema.estado.usuario.id,
                user_email: window.Sistema.estado.usuario.email,
                user_role: window.Sistema.estado.usuario.rol,
                n_factura: this.generarNumeroFactura(),
                dolartoday: window.Sistema.estado.tasaBCV,
                total_usd: parseFloat(this.calcularTotalUSD()),
                total_ves: parseFloat(this.calcularTotalVES()),
                items: JSON.stringify(this.carrito.map(item => ({
                    producto_id: item.producto.id,
                    producto: item.producto.name_p,
                    sku: item.producto.id_p,
                    cantidad: item.cantidad,
                    precio_unitario: item.producto.price_usd,
                    subtotal: item.producto.price_usd * item.cantidad
                }))),
                payment_method: this._metodoPago,
                payment_details: {},
                id_fecha: fechaInmutable,
                transaction_id: tx.id
            };
            
            const ventaRegistrada = await window.pb.collection('sales').create(ventaData, { requestKey: `venta_${Date.now()}`, $autoCancel: false });
            
            await window.Sistema.registrarLog('VENTA_COMPLETADA', { factura: ventaData.n_factura, total_usd: ventaData.total_usd, items_count: this.carrito.length, transaction_id: tx.id, venta_id: ventaRegistrada.id });
            
            const itemsVendidos = [...this.carrito];
            this.carrito = [];
            const storageKey = window.CONFIG?.STORAGE_KEYS?.CARRITO || 'sisov_carrito';
            localStorage.removeItem(storageKey);
            
            if (window.CONFIG) {
                window.Sistema.emitirEvento(window.CONFIG.EVENTOS.VENTA_COMPLETADA, { factura: ventaData.n_factura, total: ventaData.total_usd, items: itemsVendidos });
            }
            
            tx.completar();
            
            await Swal.fire({
                icon: 'success',
                title: '¡Venta Exitosa!',
                html: `<div class="text-center"><p class="text-2xl font-bold text-primary mb-2">${ventaData.n_factura}</p><p class="text-lg">Total: ${window.Sistema.formatearMoneda(ventaData.total_usd)}</p><p class="text-sm text-slate-500 mt-2">La venta se ha registrado correctamente</p></div>`,
                confirmButtonText: 'Imprimir Recibo',
                showCancelButton: true,
                cancelButtonText: 'Cerrar'
            }).then((result) => {
                if (result.isConfirmed && window.Reportes) {
                    window.Reportes.generarPDFVenta(ventaRegistrada.id);
                }
            });
            
            this.renderizarProductos();
            
        } catch (error) {
            tx.fallar(error);
            await window.Sistema.registrarLog('VENTA_FALLIDA', { error: error.message, transaction_id: tx.id, carrito: this.carrito.map(i => ({ id: i.producto.id, cantidad: i.cantidad })) });
            window.Sistema.mostrarToast('Error al registrar la venta. El stock ya fue reservado.', 'error');
            throw error;
        }
    },
    
    // ======================================================
    // UTILIDADES
    // ======================================================
    
    generarNumeroFactura() {
        const fecha = new Date();
        const year = fecha.getFullYear().toString().slice(-2);
        const month = String(fecha.getMonth() + 1).padStart(2, '0');
        const day = String(fecha.getDate()).padStart(2, '0');
        const random = Math.floor(Math.random() * 900 + 100);
        const secuencial = String(Date.now()).slice(-6);
        return `FAC-${year}${month}${day}-${secuencial}-${random}`;
    },
    
    generarResumenVenta() {
        const subtotalUSD = this.calcularTotalUSD();
        const totalVES = this.calcularTotalVES();
        
        let productosHtml = '';
        this.carrito.forEach(item => {
            const subtotal = item.producto.price_usd * item.cantidad;
            productosHtml += `<tr><td class="py-1">${item.producto.name_p}</td><td class="py-1 text-center">${item.cantidad}</td><td class="py-1 text-right">${window.Sistema.formatearMoneda(item.producto.price_usd)}</td><td class="py-1 text-right">${window.Sistema.formatearMoneda(subtotal)}</td></tr>`;
        });
        
        return `
            <div class="text-left">
                <table class="w-full text-sm mb-4">
                    <thead class="border-b border-slate-200"><tr><th class="py-2 text-left">Producto</th><th class="py-2 text-center">Cant.</th><th class="py-2 text-right">Precio</th><th class="py-2 text-right">Subtotal</th></tr></thead>
                    <tbody>${productosHtml}</tbody>
                    <tfoot class="border-t border-slate-200">
                        <tr><td colspan="3" class="py-2 text-right font-bold">Subtotal USD:</td><td class="py-2 text-right font-bold">${window.Sistema.formatearMoneda(subtotalUSD)}</td></tr>
                        <tr><td colspan="3" class="py-2 text-right font-bold">Total Bs:</td><td class="py-2 text-right font-bold text-primary">${window.Sistema.formatearMoneda(totalVES, 'VES')}</td></tr>
                    </tfoot>
                </table>
                <div class="bg-slate-50 p-3 rounded-lg text-sm">
                    <p><strong>Método de pago:</strong> ${this._metodoPago}</p>
                    <p><strong>Tasa BCV:</strong> ${window.Sistema.estado.tasaBCV.toFixed(2)} Bs/$</p>
                </div>
            </div>
        `;
    },
    
    calcularTotalUSD() {
        return this.carrito.reduce((total, item) => total + (item.producto.price_usd * item.cantidad), 0);
    },
    
    calcularTotalVES() {
        return this.calcularTotalUSD() * window.Sistema.estado.tasaBCV;
    },
    
    // ======================================================
    // UI
    // ======================================================
    
    renderizarProductos() {
        const container = document.getElementById('productGrid');
        if (!container) return;
        
        const productos = window.Sistema.estado.productos;
        
        if (productos.length === 0) {
            container.innerHTML = `<div class="col-span-full text-center py-12"><i data-lucide="package-x" class="w-16 h-16 mx-auto text-slate-300 mb-4"></i><p class="text-slate-400">No hay productos disponibles</p><button onclick="Inventario.mostrarModalProducto()" class="btn-primary mt-4 px-6 py-2 rounded-lg text-white">Agregar Producto</button></div>`;
            if (window.lucide) lucide.createIcons();
            return;
        }
        
        container.innerHTML = '';
        productos.forEach(producto => container.appendChild(this.crearCardProducto(producto)));
        if (window.lucide) lucide.createIcons();
    },
    
    crearCardProducto(producto) {
        const div = document.createElement('div');
        div.className = 'bg-white rounded-xl shadow border border-slate-200 p-4 card-hover';
        const stockClass = producto.stock > 10 ? 'badge-success' : producto.stock > 0 ? 'badge-warning' : 'badge-danger';
        
        div.innerHTML = `
            <div class="mb-3">
                <span class="text-xs font-semibold text-slate-500">${producto.category || 'General'}</span>
                <h4 class="font-bold text-slate-800 truncate" title="${producto.name_p}">${producto.name_p}</h4>
                <p class="text-xs text-slate-500 font-mono">${producto.id_p || producto.id.slice(0,8)}</p>
            </div>
            <div class="flex items-center justify-between mb-4">
                <div>
                    <span class="text-lg font-bold text-primary">${window.Sistema.formatearMoneda(producto.price_usd)}</span>
                    <p class="text-xs text-slate-500">${window.Sistema.formatearMoneda(producto.price_usd * window.Sistema.estado.tasaBCV, 'VES')}</p>
                </div>
                <span class="badge ${stockClass}" title="Stock actual: ${producto.stock} unidades">${producto.stock} uds.</span>
            </div>
            <button onclick="Ventas.agregarAlCarrito('${producto.id}')" ${producto.stock <= 0 ? 'disabled' : ''} class="w-full btn-primary py-2 rounded-lg text-white font-semibold ${producto.stock <= 0 ? 'opacity-50 cursor-not-allowed' : ''}"><i data-lucide="shopping-cart" class="w-4 h-4 inline mr-2"></i>${producto.stock > 0 ? 'Agregar' : 'Sin Stock'}</button>
        `;
        return div;
    },
    
    actualizarCarritoUI() {
        const container = document.getElementById('cartItems');
        const countElement = document.getElementById('cartCount');
        const subtotalElement = document.getElementById('subtotalUSD');
        const totalElement = document.getElementById('totalVES');
        const procesarBtn = document.getElementById('btnProcesarVenta');
        
        if (!container || !countElement) return;
        
        countElement.textContent = this.carrito.length;
        
        const subtotalUSD = this.calcularTotalUSD();
        const totalVES = this.calcularTotalVES();
        
        subtotalElement.textContent = window.Sistema.formatearMoneda(subtotalUSD);
        totalElement.textContent = window.Sistema.formatearMoneda(totalVES, 'VES');
        
        // [REFACTOR] Usar AuthSecurity.licenciaEsActiva
        const licenciaActiva = window.AuthSecurity?.licenciaEsActiva || false;
        procesarBtn.disabled = this.carrito.length === 0 || !licenciaActiva || this._procesandoVenta;
        
        if (this.carrito.length === 0) {
            container.innerHTML = `<div class="text-center py-8 text-slate-400"><i data-lucide="shopping-cart" class="w-12 h-12 mx-auto mb-3 opacity-30"></i><p class="text-sm font-medium">Carrito vacío</p></div>`;
            if (window.lucide) lucide.createIcons();
            return;
        }
        
        container.innerHTML = '';
        
        this.carrito.forEach((item, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors';
            itemDiv.innerHTML = `
                <div class="flex-1 min-w-0">
                    <h5 class="font-semibold text-slate-800 text-sm truncate" title="${item.producto.name_p}">${item.producto.name_p}</h5>
                    <p class="text-xs text-slate-500">${window.Sistema.formatearMoneda(item.producto.price_usd)} c/u</p>
                </div>
                <div class="flex items-center gap-1 ml-2">
                    <button onclick="Ventas.actualizarCantidad(${index}, ${item.cantidad - 1})" class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 transition-colors" ${item.cantidad <= 1 ? 'disabled' : ''}><i data-lucide="minus" class="w-3 h-3"></i></button>
                    <span class="w-8 text-center font-bold text-sm">${item.cantidad}</span>
                    <button onclick="Ventas.actualizarCantidad(${index}, ${item.cantidad + 1})" class="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 transition-colors" ${item.cantidad >= item.producto.stock ? 'disabled' : ''}><i data-lucide="plus" class="w-3 h-3"></i></button>
                    <button onclick="Ventas.removerDelCarrito(${index})" class="w-7 h-7 flex items-center justify-center rounded-lg bg-red-100 hover:bg-red-200 text-red-600 ml-1 transition-colors"><i data-lucide="trash-2" class="w-3 h-3"></i></button>
                </div>
            `;
            container.appendChild(itemDiv);
        });
        
        if (window.lucide) lucide.createIcons();
    },
    
    seleccionarMetodoPago(metodo) {
        this._metodoPago = metodo;
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
    
    buscarProductos(termino) {
        if (!termino || termino.trim() === '') { this.renderizarProductos(); return; }
        termino = termino.toLowerCase().trim();
        const productosFiltrados = window.Sistema.estado.productos.filter(producto => {
            return producto.name_p.toLowerCase().includes(termino) ||
                   (producto.id_p && producto.id_p.toLowerCase().includes(termino)) ||
                   (producto.category && producto.category.toLowerCase().includes(termino));
        });
        
        const container = document.getElementById('productGrid');
        if (!container) return;
        
        if (productosFiltrados.length === 0) {
            container.innerHTML = `<div class="col-span-full text-center py-8"><i data-lucide="search-x" class="w-12 h-12 mx-auto text-slate-300 mb-3"></i><p class="text-slate-400">No se encontraron productos para "${termino}"</p></div>`;
        } else {
            container.innerHTML = '';
            productosFiltrados.forEach(producto => container.appendChild(this.crearCardProducto(producto)));
        }
        if (window.lucide) lucide.createIcons();
    },
    
    iniciarScanner() {
        document.getElementById('modalScanner')?.classList.add('active');
        setTimeout(() => window.Sistema.mostrarToast('Escáner listo', 'info'), 500);
    },
    
    detenerScanner() {
        document.getElementById('modalScanner')?.classList.remove('active');
    }
};

window.Ventas = Ventas;

if (window.Sistema && window.CONFIG) {
    const stockUpdatedHandler = () => {
        if (document.getElementById('tabVentas')?.classList.contains('active')) {
            Ventas.renderizarProductos();
            Ventas.actualizarCarritoUI();
        }
    };
    window.Sistema.on(window.CONFIG.EVENTOS.STOCK_ACTUALIZADO, stockUpdatedHandler);
    window._ventasStockHandler = stockUpdatedHandler;
}