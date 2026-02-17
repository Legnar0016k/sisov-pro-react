/**
 * @file inventario.js
 * @description Módulo de inventario refactorizado
 */

const Inventario = {
    _cargando: false,
    _ultimoHash: "",
    _todosLosProductos: [],
    
    // ======================================================
    // CARGA DE PRODUCTOS
    // ======================================================
    
    async cargarProductos(forzar = false) {
        if (this._cargando && !forzar) {
            console.log("[INVENTARIO] Ya cargando, ignorando...");
            return;
        }
        
        try {
            this._cargando = true;
            
            const userId = window.Sistema.estado.usuario?.id;
            if (!userId) {
                console.warn("[INVENTARIO] No hay usuario autenticado");
                return;
            }
            
            const records = await window.pb.collection('products').getFullList({
                filter: `created_by = "${userId}"`,
                sort: '-created',
                requestKey: `inventario_${Date.now()}`,
                $autoCancel: false
            });
            
            // Verificar si hubo cambios
            const hashActual = JSON.stringify(records.map(p => `${p.id}-${p.updated}-${p.stock}`));
            
            if (this._ultimoHash === hashActual && !forzar) {
                console.log("[INVENTARIO] Sin cambios, usando caché");
                this._cargando = false;
                return;
            }
            
            this._ultimoHash = hashActual;
            this._todosLosProductos = records;
            window.Sistema.estado.productos = records;
            
            console.log(`[INVENTARIO] ${records.length} productos cargados`);
            
            // Actualizar UI
            this.renderizarInventario();
            
            // Si hay ventas activas, actualizar también
            if (window.Ventas && document.getElementById('tabVentas')?.classList.contains('active')) {
                window.Ventas.renderizarProductos();
            }
            
        } catch (error) {
            if (!error.isAbort) {
                window.Sistema.manejarError('cargar_productos', error);
            }
        } finally {
            this._cargando = false;
        }
    },
    
    // ======================================================
    // CRUD DE PRODUCTOS
    // ======================================================
    
    async guardarProducto(event) {
        if (event) event.preventDefault();
        
        try {
            // Validar sesión
            if (!window.Sistema.estado.usuario) {
                throw new Error("Sesión no válida");
            }
            
            // Obtener datos del formulario
            const productoData = {
                name_p: document.getElementById('productName').value.trim(),
                id_p: document.getElementById('productSKU').value.trim(),
                category: document.getElementById('productCategory').value.trim() || 'General',
                price_usd: parseFloat(document.getElementById('productPrice').value),
                stock: parseInt(document.getElementById('productStock').value),
                created_by: window.Sistema.estado.usuario.id
            };
            
            // Validaciones
            if (!productoData.name_p) throw new Error("El nombre del producto es requerido");
            if (isNaN(productoData.price_usd) || productoData.price_usd <= 0) {
                throw new Error("El precio debe ser mayor a 0");
            }
            if (isNaN(productoData.stock) || productoData.stock < 0) {
                throw new Error("El stock no puede ser negativo");
            }
            
            const productoId = document.getElementById('productId').value;
            
            let resultado;
            
            if (productoId) {
                // Actualizar
                resultado = await window.pb.collection('products').update(productoId, productoData, {
                    requestKey: `update_${Date.now()}`,
                    $autoCancel: false
                });
                
                await window.Sistema.registrarLog('PRODUCTO_ACTUALIZADO', {
                    producto_id: productoId,
                    datos: productoData
                });
                
                window.Sistema.mostrarToast('Producto actualizado', 'success');
            } else {
                // Crear nuevo
                resultado = await window.pb.collection('products').create(productoData, {
                    requestKey: `create_${Date.now()}`,
                    $autoCancel: false
                });
                
                await window.Sistema.registrarLog('PRODUCTO_CREADO', {
                    producto_id: resultado.id,
                    nombre: productoData.name_p
                });
                
                window.Sistema.mostrarToast('Producto creado', 'success');
            }
            
            // Recargar productos
            await this.cargarProductos(true);
            
            // Cerrar modal
            this.cerrarModalProducto();
            
        } catch (error) {
            window.Sistema.manejarError('guardar_producto', error);
        }
    },
    
    async eliminarProducto(productoId) {
        const producto = window.Sistema.estado.productos.find(p => p.id === productoId);
        
        const confirmacion = await Swal.fire({
            title: '¿Eliminar producto?',
            text: `¿Estás seguro de eliminar "${producto?.name_p || 'este producto'}"?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#ef4444'
        });
        
        if (!confirmacion.isConfirmed) return;
        
        try {
            await window.pb.collection('products').delete(productoId, {
                requestKey: `delete_${Date.now()}`,
                $autoCancel: false
            });
            
            await window.Sistema.registrarLog('PRODUCTO_ELIMINADO', {
                producto_id: productoId,
                nombre: producto?.name_p
            });
            
            // Actualizar estado
            window.Sistema.estado.productos = window.Sistema.estado.productos.filter(p => p.id !== productoId);
            this._todosLosProductos = this._todosLosProductos.filter(p => p.id !== productoId);
            
            // Actualizar UI
            this.renderizarInventario();
            if (window.Ventas) window.Ventas.renderizarProductos();
            
            window.Sistema.mostrarToast('Producto eliminado', 'success');
            
        } catch (error) {
            window.Sistema.manejarError('eliminar_producto', error);
        }
    },
    
    // ======================================================
    // AJUSTE DE STOCK
    // ======================================================
    
    async abrirModalAjusteStock(productoId) {
        const producto = window.Sistema.estado.productos.find(p => p.id === productoId);
        if (!producto) return;
        
        const { value: ajuste } = await Swal.fire({
            title: `Ajustar Stock - ${producto.name_p}`,
            html: `
                <div class="space-y-4">
                    <div class="bg-slate-100 p-4 rounded-lg">
                        <p class="text-sm text-slate-600">Stock actual</p>
                        <p class="text-3xl font-bold text-primary">${producto.stock}</p>
                    </div>
                    
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-2">Añadir</label>
                            <input type="number" id="ajusteSumar" value="0" min="0" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 outline-none">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-2">Restar</label>
                            <input type="number" id="ajusteRestar" value="0" min="0" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-amber-500 outline-none">
                        </div>
                    </div>
                    
                    <div class="text-sm text-slate-500 bg-blue-50 p-3 rounded-lg" id="vistaPreviaStock">
                        Stock final: <span class="font-bold text-primary">${producto.stock}</span>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Motivo del ajuste</label>
                        <input type="text" id="motivoAjuste" placeholder="Ej: Inventario físico, corrección, etc." class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none">
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Aplicar Cambios',
            cancelButtonText: 'Cancelar',
            width: 500,
            didOpen: () => {
                const sumar = document.getElementById('ajusteSumar');
                const restar = document.getElementById('ajusteRestar');
                const vistaPrevia = document.getElementById('vistaPreviaStock');
                
                const actualizarVista = () => {
                    const s = parseInt(sumar.value) || 0;
                    const r = parseInt(restar.value) || 0;
                    const nuevoStock = producto.stock + s - r;
                    
                    vistaPrevia.innerHTML = `Stock final: <span class="font-bold ${nuevoStock >= 0 ? 'text-primary' : 'text-danger'}">${nuevoStock}</span>`;
                };
                
                sumar.addEventListener('input', actualizarVista);
                restar.addEventListener('input', actualizarVista);
                
                if (window.lucide) lucide.createIcons();
            },
            preConfirm: () => {
                const sumar = parseInt(document.getElementById('ajusteSumar').value) || 0;
                const restar = parseInt(document.getElementById('ajusteRestar').value) || 0;
                const motivo = document.getElementById('motivoAjuste').value.trim();
                
                if (sumar === 0 && restar === 0) {
                    Swal.showValidationMessage('Debes ingresar al menos una cantidad');
                    return false;
                }
                
                const nuevoStock = producto.stock + sumar - restar;
                if (nuevoStock < 0) {
                    Swal.showValidationMessage('El stock no puede ser negativo');
                    return false;
                }
                
                return { sumar, restar, motivo, nuevoStock };
            }
        });
        
        if (ajuste) {
            await this.aplicarAjusteStock(productoId, ajuste);
        }
    },
    
    async aplicarAjusteStock(productoId, ajuste) {
        try {
            // Usar el sistema transaccional
            const cambio = ajuste.sumar - ajuste.restar;
            
            await window.Sistema.ajustarStock(
                productoId,
                cambio,
                ajuste.motivo || 'ajuste_manual',
                { sumado: ajuste.sumar, restado: ajuste.restar }
            );
            
            window.Sistema.mostrarToast('Stock actualizado', 'success');
            
            // Actualizar UI
            this.renderizarInventario();
            
        } catch (error) {
            window.Sistema.manejarError('ajuste_stock', error);
        }
    },
    
    // ======================================================
    // UI DEL INVENTARIO
    // ======================================================
    
    renderizarInventario() {
        const container = document.getElementById('inventoryTable');
        if (!container) return;
        
        const productos = window.Sistema.estado.productos;
        
        if (productos.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="7" class="p-8 text-center text-slate-400">
                        <i data-lucide="package" class="w-12 h-12 mx-auto mb-3 opacity-30"></i>
                        <p>No hay productos en el inventario</p>
                        <button onclick="Inventario.mostrarModalProducto()" class="btn-primary mt-4 px-4 py-2 rounded-lg text-white">
                            Agregar Producto
                        </button>
                    </td>
                </tr>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }
        
        container.innerHTML = '';
        
        productos.forEach(producto => {
            const row = this.crearFilaProducto(producto);
            container.appendChild(row);
        });
        
        // Actualizar contador
        this.mostrarResultados(productos.length);
        
        if (window.lucide) lucide.createIcons();
    },
    
    crearFilaProducto(producto) {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50 transition-colors';
        
        const fechaRegistro = producto.created ? new Date(producto.created).toLocaleDateString('es-VE') : '---';
        const stockClass = producto.stock > 10 ? 'badge-success' : 
                          producto.stock > 0 ? 'badge-warning' : 'badge-danger';
        
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
                <span class="badge ${stockClass}" title="Stock actual: ${producto.stock} unidades">
                    ${producto.stock} unidades
                </span>
            </td>
            <td class="p-4">
                <span class="text-sm text-slate-500 font-medium">${fechaRegistro}</span>
            </td>
            <td class="p-4">
                <span class="font-bold text-slate-800">${window.Sistema.formatearMoneda(producto.price_usd)}</span>
                <span class="text-xs text-slate-500 block">${window.Sistema.formatearMoneda(producto.price_usd * window.Sistema.estado.tasaBCV, 'VES')}</span>
            </td>
            <td class="p-4">
                <span class="text-sm text-slate-600">${producto.category || 'General'}</span>
            </td>
            <td class="p-4">
                <div class="flex gap-1">
                    <button onclick="Inventario.editarProducto('${producto.id}')" 
                            class="p-2 text-primary hover:bg-primary hover:text-white rounded-lg transition-colors"
                            title="Editar producto">
                        <i data-lucide="edit" class="w-4 h-4"></i>
                    </button>
                    
                    <button onclick="Inventario.abrirModalAjusteStock('${producto.id}')" 
                            class="p-2 text-amber-600 hover:bg-amber-600 hover:text-white rounded-lg transition-colors"
                            title="Ajustar stock">
                        <i data-lucide="package-plus" class="w-4 h-4"></i>
                    </button>
                    
                    <button onclick="Inventario.eliminarProducto('${producto.id}')" 
                            class="p-2 text-danger hover:bg-danger hover:text-white rounded-lg transition-colors"
                            title="Eliminar producto">
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
            const producto = window.Sistema.estado.productos.find(p => p.id === productoId);
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
            title.textContent = 'Nuevo Producto';
            form.reset();
            document.getElementById('productId').value = '';
        }
        
        modal.classList.add('active');
        
        // Remover event listener anterior para evitar duplicados
        form.removeEventListener('submit', window._guardarProductoHandler);
        window._guardarProductoHandler = (e) => this.guardarProducto(e);
        form.addEventListener('submit', window._guardarProductoHandler);
    },
    
    cerrarModalProducto() {
        document.getElementById('modalProducto').classList.remove('active');
    },
    
    // ======================================================
    // FILTROS Y BÚSQUEDA
    // ======================================================
    
    filtrarProductos(filtro) {
        const productos = window.Sistema.estado.productos;
        
        let productosFiltrados = [];
        
        switch(filtro) {
            case 'todos':
                productosFiltrados = productos;
                break;
            case 'bajo':
                productosFiltrados = productos.filter(p => p.stock > 0 && p.stock <= 10);
                break;
            case 'agotado':
                productosFiltrados = productos.filter(p => p.stock === 0);
                break;
            default:
                productosFiltrados = productos;
        }
        
        // Renderizar filtrados
        const container = document.getElementById('inventoryTable');
        if (!container) return;
        
        if (productosFiltrados.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="7" class="p-8 text-center text-slate-400">
                        <i data-lucide="filter" class="w-12 h-12 mx-auto mb-3 opacity-30"></i>
                        <p>No hay productos que coincidan con el filtro</p>
                    </td>
                </tr>
            `;
        } else {
            container.innerHTML = '';
            productosFiltrados.forEach(producto => {
                const row = this.crearFilaProducto(producto);
                container.appendChild(row);
            });
        }
        
        // Limpiar campo de búsqueda
        const searchInput = document.getElementById('searchInventory');
        if (searchInput) searchInput.value = '';
        
        // Mostrar resultados
        this.mostrarResultados(productosFiltrados.length);
        
        if (window.lucide) lucide.createIcons();
    },
    
    buscarEnInventario(termino) {
        const container = document.getElementById('inventoryTable');
        if (!container) return;
        
        if (!termino || termino.trim() === '') {
            this.renderizarInventario();
            return;
        }
        
        termino = termino.toLowerCase().trim();
        
        const productosFiltrados = window.Sistema.estado.productos.filter(producto => {
            const nombre = (producto.name_p || '').toLowerCase();
            const sku = (producto.id_p || '').toLowerCase();
            const categoria = (producto.category || '').toLowerCase();
            const stock = producto.stock?.toString() || '';
            const precio = producto.price_usd?.toString() || '';
            
            return nombre.includes(termino) ||
                   sku.includes(termino) ||
                   categoria.includes(termino) ||
                   stock.includes(termino) ||
                   precio.includes(termino);
        });
        
        if (productosFiltrados.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="7" class="p-8 text-center text-slate-400">
                        <i data-lucide="search-x" class="w-12 h-12 mx-auto mb-3 opacity-30"></i>
                        <p>No se encontraron productos para "${termino}"</p>
                    </td>
                </tr>
            `;
        } else {
            container.innerHTML = '';
            productosFiltrados.forEach(producto => {
                const row = this.crearFilaProducto(producto);
                container.appendChild(row);
            });
        }
        
        this.mostrarResultados(productosFiltrados.length);
        
        if (window.lucide) lucide.createIcons();
    },
    
    mostrarResultados(count) {
        const container = document.getElementById('inventoryTable');
        if (!container) return;
        
        let counter = document.getElementById('inventorySearchResults');
        if (!counter) {
            counter = document.createElement('div');
            counter.id = 'inventorySearchResults';
            counter.className = 'text-xs text-slate-500 mt-2 text-right';
            container.parentElement.insertBefore(counter, container.nextSibling);
        }
        
        counter.textContent = count === 0 ? 'No se encontraron resultados' : 
                              `${count} producto${count !== 1 ? 's' : ''}`;
    },
    
    // ======================================================
    // EDICIÓN DE PRODUCTOS
    // ======================================================
    
    async editarProducto(productoId) {
        const producto = window.Sistema.estado.productos.find(p => p.id === productoId);
        if (!producto) return;
        
        const { value: formValues } = await Swal.fire({
            title: 'Editar Producto',
            html: `
                <div class="space-y-4 text-left">
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Nombre</label>
                        <input type="text" id="editNombre" value="${producto.name_p}" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-2">SKU</label>
                            <input type="text" id="editSKU" value="${producto.id_p || ''}" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-2">Categoría</label>
                            <input type="text" id="editCategoria" value="${producto.category || ''}" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none">
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-2">Precio USD</label>
                            <input type="number" step="0.01" id="editPrecio" value="${producto.price_usd}" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-2">Stock</label>
                            <input type="number" id="editStock" value="${producto.stock}" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none">
                        </div>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Guardar Cambios',
            cancelButtonText: 'Cancelar',
            width: 600,
            preConfirm: () => {
                const nombre = document.getElementById('editNombre').value.trim();
                const sku = document.getElementById('editSKU').value.trim();
                const categoria = document.getElementById('editCategoria').value.trim();
                const precio = parseFloat(document.getElementById('editPrecio').value);
                const stock = parseInt(document.getElementById('editStock').value);
                
                if (!nombre) {
                    Swal.showValidationMessage('El nombre es requerido');
                    return false;
                }
                
                if (isNaN(precio) || precio <= 0) {
                    Swal.showValidationMessage('El precio debe ser mayor a 0');
                    return false;
                }
                
                if (isNaN(stock) || stock < 0) {
                    Swal.showValidationMessage('El stock no puede ser negativo');
                    return false;
                }
                
                return { nombre, sku, categoria, precio, stock };
            }
        });
        
        if (formValues) {
            await this.guardarEdicion(productoId, formValues);
        }
    },
    
    async guardarEdicion(productoId, datos) {
        try {
            const productoData = {
                name_p: datos.nombre,
                id_p: datos.sku,
                category: datos.categoria || 'General',
                price_usd: datos.precio,
                stock: datos.stock
            };
            
            await window.pb.collection('products').update(productoId, productoData, {
                requestKey: `edit_${Date.now()}`,
                $autoCancel: false
            });
            
            // Actualizar en memoria
            const producto = window.Sistema.estado.productos.find(p => p.id === productoId);
            if (producto) {
                Object.assign(producto, productoData);
            }
            
            await window.Sistema.registrarLog('PRODUCTO_EDITADO', {
                producto_id: productoId,
                datos: productoData
            });
            
            this.renderizarInventario();
            if (window.Ventas) window.Ventas.renderizarProductos();
            
            window.Sistema.mostrarToast('Producto actualizado', 'success');
            
        } catch (error) {
            window.Sistema.manejarError('editar_producto', error);
        }
    }
};

// Exponer globalmente
window.Inventario = Inventario;