//======================================================//
//====================INVENTARIO.JS=======================//
//======================================================//

const Inventario = {
    cargando: false, 
    ultimoHash: "",
    
    // Modifica la función cargarProductos para guardar la lista completa:

    async cargarProductos() {
            if (this.cargando) return;
            
            try {
                this.cargando = true;
                const userId = window.pb.authStore.model?.id;
                if (!userId) return;
            
                const records = await window.pb.collection('products').getFullList({
                    filter: `created_by = "${userId}"`,
                    sort: '-created',
                    requestKey: 'carga_silo_unico'
                });
            
                const hashActual = JSON.stringify(records.map(p => p.id + p.updated));
                
                if (this.ultimoHash === hashActual) {
                    this.cargando = false;
                    return; 
                }
            
                this.ultimoHash = hashActual;
                window.Sistema.estado.productos = records;
                
                // GUARDAR TODOS LOS PRODUCTOS PARA EL FILTRO
                this.todosLosProductos = records;
                
                console.log(`%c[SILO] ${records.length} productos actualizados en memoria.`, "color: #10b981;");
                
                this.renderizarInventario();
            
            } catch (error) {
                if (!error.isAbort) console.error("Error en silo:", error);
            } finally {
                this.cargando = false;
            }
    },
    
    renderizarInventario() {
            const container = document.getElementById('inventoryTable');
            if (!container) return;

            container.innerHTML = '';

            const productos = window.Sistema.estado.productos || [];

            productos.forEach(producto => {
                const row = this.crearFilaProducto(producto);
                container.appendChild(row);
            });
        
            if (typeof window.refrescarIconos === 'function') {
                window.refrescarIconos();
            }
        },

    crearFilaProducto(producto) {
         const tr = document.createElement('tr');
         tr.className = 'hover:bg-slate-50';

         const fechaRegistro = producto.created ? new Date(producto.created).toLocaleDateString() : '---';
         const productoId = producto.id; // Guardar el ID real

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
                 <span class="font-bold text-slate-800">${window.Sistema.formatearMoneda(producto.price_usd)}</span>
             </td>
             <td class="p-4">
                 <span class="text-sm text-slate-600">${producto.category || 'General'}</span>
             </td>
             <td class="p-4">
                 <div class="flex gap-1">
                     <!-- Botón Editar -->
                     <button onclick="Inventario.editarProducto('${productoId}')" 
                             class="p-2 text-primary hover:bg-primary hover:text-white rounded-lg transition-colors"
                             title="Editar producto">
                         <i data-lucide="edit" class="w-4 h-4"></i>
                     </button>

                     <!-- Botón Ajustar Stock -->
                     <button onclick="Inventario.abrirModalAjusteStock('${productoId}')" 
                             class="p-2 text-amber-600 hover:bg-amber-600 hover:text-white rounded-lg transition-colors"
                             title="Ajustar stock">
                         <i data-lucide="package-plus" class="w-4 h-4"></i>
                     </button>

                     <!-- Botón Eliminar -->
                     <button onclick="Inventario.eliminarProducto('${productoId}')" 
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
    },
    
    cerrarModalProducto() {
        document.getElementById('modalProducto').classList.remove('active');
    },
    
    async guardarProducto(event) {
        if (event) event.preventDefault();

        try {
            if (!window.pb.authStore.isValid) throw new Error("Sesión inválida");
        
            const userId = window.pb.authStore.model.id;

            const productoData = {
                name_p: document.getElementById('productName').value,
                id_p: document.getElementById('productSKU').value,
                category: document.getElementById('productCategory').value,
                price_usd: parseFloat(document.getElementById('productPrice').value),
                stock: parseInt(document.getElementById('productStock').value),
                created_by: userId 
            };

            const productoId = document.getElementById('productId').value;

            console.log(`%c[INVENTARIO] producto ingresado en el inventario`, "color: #fbbf24;");
        
            if (productoId) {
                await window.pb.collection('products').update(productoId, productoData);
                window.Sistema.mostrarToast('Producto actualizado', 'success');
            } else {
                await window.pb.collection('products').create(productoData);
                window.Sistema.mostrarToast('Producto guardado', 'success');
            }

            await this.cargarProductos(); 
            this.renderizarInventario();
            if (window.Ventas) Ventas.renderizarProductos();
            this.cerrarModalProducto();

        } catch (error) {
            console.error('Error de persistencia:', error.message);
            window.Sistema.mostrarToast('Error al procesar', 'error');
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
                    await window.pb.collection('products').delete(productoId);
                    
                    window.Sistema.estado.productos = window.Sistema.estado.productos.filter(p => p.id !== productoId);
                    
                    this.renderizarInventario();
                    if (window.Ventas) Ventas.renderizarProductos();
                    
                    window.Sistema.mostrarToast('Producto eliminado', 'success');
                } catch (error) {
                    window.Sistema.mostrarToast('Error eliminando producto', 'error');
                }
            }
        });
    },

    // Añadir después de eliminarProducto, antes de editarProducto

    async abrirModalAjusteStock(productoId) {
        const producto = window.Sistema.estado.productos.find(p => p.id === productoId);
        if (!producto) return;

        Swal.fire({
            title: `Ajustar Stock - ${producto.name_p}`,
            html: `
                <div class="space-y-4 text-left">
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Stock Actual</label>
                        <div class="bg-slate-100 p-3 rounded-lg text-center font-bold text-xl">
                            ${producto.stock} unidades
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-2">Cantidad a Añadir</label>
                            <input type="number" 
                                   id="ajusteSumar" 
                                   value="0" 
                                   min="0"
                                   class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 outline-none">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-slate-700 mb-2">Cantidad a Restar</label>
                            <input type="number" 
                                   id="ajusteRestar" 
                                   value="0" 
                                   min="0"
                                   class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-amber-500 outline-none">
                        </div>
                    </div>

                    <div class="text-sm text-slate-500 bg-blue-50 p-3 rounded-lg">
                        <i data-lucide="info" class="w-4 h-4 inline mr-1"></i>
                        Puedes sumar y restar al mismo tiempo. El stock final será: 
                        <span id="stockResultado" class="font-bold text-primary">${producto.stock}</span>
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Aplicar Cambios',
            cancelButtonText: 'Cancelar',
            width: '600px',
            didOpen: () => {
                lucide.createIcons();

                // Actualizar vista previa del stock
                const sumarInput = document.getElementById('ajusteSumar');
                const restarInput = document.getElementById('ajusteRestar');
                const resultadoSpan = document.getElementById('stockResultado');

                const actualizarVista = () => {
                    const sumar = parseInt(sumarInput.value) || 0;
                    const restar = parseInt(restarInput.value) || 0;
                    const nuevoStock = producto.stock + sumar - restar;
                    resultadoSpan.textContent = nuevoStock;
                    resultadoSpan.className = nuevoStock >= 0 ? 'font-bold text-primary' : 'font-bold text-danger';
                };

                sumarInput.addEventListener('input', actualizarVista);
                restarInput.addEventListener('input', actualizarVista);
            },
            preConfirm: async () => {
                const sumar = parseInt(document.getElementById('ajusteSumar').value) || 0;
                const restar = parseInt(document.getElementById('ajusteRestar').value) || 0;

                if (sumar === 0 && restar === 0) {
                    Swal.showValidationMessage('Debes ingresar al menos una cantidad');
                    return false;
                }

                const nuevoStock = producto.stock + sumar - restar;

                if (nuevoStock < 0) {
                    Swal.showValidationMessage('El stock no puede ser negativo');
                    return false;
                }

                return { sumar, restar, nuevoStock };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                await this.aplicarAjusteStock(productoId, result.value);
            }
        });
    },

        filtrarProductos(filtro) {
            // Obtener todos los productos
            const todosLosProductos = window.Sistema.estado.productos || [];
            
            let productosFiltrados = [];
            
            switch(filtro) {
                case 'todos':
                    productosFiltrados = todosLosProductos;
                    break;
                case 'bajo':
                    productosFiltrados = todosLosProductos.filter(p => p.stock > 0 && p.stock <= 10);
                    break;
                case 'agotado':
                    productosFiltrados = todosLosProductos.filter(p => p.stock === 0);
                    break;
                default:
                    productosFiltrados = todosLosProductos;
            }

            // Actualizar la lista completa para el filtro de búsqueda
            this.todosLosProductos = todosLosProductos;

            // Renderizar los productos filtrados
            this.renderizarInventarioConFiltro(productosFiltrados);
            this.mostrarResultadosInventario(productosFiltrados.length);

            // Limpiar el campo de búsqueda
            const searchInput = document.getElementById('searchInventory');
            if (searchInput) {
                searchInput.value = '';
            }

            // Mostrar mensaje contextual
            switch(filtro) {
                case 'bajo':
                    if (productosFiltrados.length === 0) {
                        window.Sistema.mostrarToast('No hay productos con stock bajo', 'info');
                    }
                    break;
                case 'agotado':
                    if (productosFiltrados.length === 0) {
                        window.Sistema.mostrarToast('No hay productos agotados', 'info');
                    }
                    break;
            }
        },

    async aplicarAjusteStock(productoId, ajuste) {
        try {
            const producto = window.Sistema.estado.productos.find(p => p.id === productoId);
            if (!producto) return;

            const nuevoStock = ajuste.nuevoStock;

            // Actualizar en PocketBase
            await window.pb.collection('products').update(productoId, {
                stock: nuevoStock
            });

            // Actualizar en memoria local
            producto.stock = nuevoStock;

            // Registrar en logs
            await window.pb.collection('system_logs').create({
                type: 'AJUSTE_STOCK',
                message: `Stock ajustado para ${producto.name_p}: ${producto.stock} → ${nuevoStock} (${ajuste.sumar > 0 ? '+' + ajuste.sumar : ''}${ajuste.restar > 0 ? ' -' + ajuste.restar : ''})`,
                user: window.Sistema.estado.usuario?.email || 'sistema',
                context: {
                    producto_id: productoId,
                    producto_nombre: producto.name_p,
                    stock_anterior: producto.stock,
                    stock_nuevo: nuevoStock,
                    sumado: ajuste.sumar,
                    restado: ajuste.restar
                }
            });

            // Actualizar UI
            this.renderizarInventario();
            if (window.Ventas) Ventas.renderizarProductos();

            window.Sistema.mostrarToast('Stock actualizado correctamente', 'success');

        } catch (error) {
            console.error('Error ajustando stock:', error);
            window.Sistema.mostrarToast('Error al ajustar stock', 'error');
        }
    },
    
    //logica para editar los productos
    editarProducto(productoId) {
        const producto = window.Sistema.estado.productos.find(p => p.id === productoId);
        if (!producto) return;

        Swal.fire({
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
            width: '600px',
            preConfirm: async () => {
                const nombre = document.getElementById('editNombre').value;
                const sku = document.getElementById('editSKU').value;
                const categoria = document.getElementById('editCategoria').value;
                const precio = parseFloat(document.getElementById('editPrecio').value);
                const stock = parseInt(document.getElementById('editStock').value);

                if (!nombre || !precio || isNaN(stock)) {
                    Swal.showValidationMessage('Todos los campos son requeridos');
                    return false;
                }

                return { nombre, sku, categoria, precio, stock };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                await this.guardarEdicion(productoId, result.value);
            }
        });
    },

    async guardarEdicion(productoId, datos) {
        try {
            const productoData = {
                name_p: datos.nombre,
                id_p: datos.sku,
                category: datos.categoria,
                price_usd: datos.precio,
                stock: datos.stock
            };

            await window.pb.collection('products').update(productoId, productoData);

            // Actualizar en memoria
            const producto = window.Sistema.estado.productos.find(p => p.id === productoId);
            if (producto) {
                Object.assign(producto, productoData);
            }

            this.renderizarInventario();
            if (window.Ventas) Ventas.renderizarProductos();

            window.Sistema.mostrarToast('Producto actualizado', 'success');

        } catch (error) {
            console.error('Error editando producto:', error);
            window.Sistema.mostrarToast('Error al actualizar', 'error');
        }
    },

    
    buscarEnInventario(termino) {
         const container = document.getElementById('inventoryTable');
         if (!container) return;
         
         // Guardar todos los productos originales si no lo hemos hecho
         if (!this.todosLosProductos) {
             this.todosLosProductos = window.Sistema.estado.productos || [];
         }

         // Si no hay término de búsqueda, mostrar todos
         if (!termino || termino.trim() === '') {
             this.renderizarInventarioConFiltro(this.todosLosProductos);
             this.mostrarResultadosInventario(this.todosLosProductos.length);
             return;
         }

         termino = termino.toLowerCase().trim();

         // Filtrar productos por término en múltiples campos
         const productosFiltrados = this.todosLosProductos.filter(producto => {
             const nombre = (producto.name_p || '').toLowerCase();
             const sku = (producto.id_p || producto.id || '').toLowerCase();
             const stock = producto.stock?.toString() || '';
             const precio = producto.price_usd?.toString() || '';
             const categoria = (producto.category || '').toLowerCase();
             const fechaRegistro = producto.created ? new Date(producto.created).toLocaleDateString().toLowerCase() : '';

             return nombre.includes(termino) ||
                    sku.includes(termino) ||
                    stock.includes(termino) ||
                    precio.includes(termino) ||
                    categoria.includes(termino) ||
                    fechaRegistro.includes(termino);
         });

         this.renderizarInventarioConFiltro(productosFiltrados);
         this.mostrarResultadosInventario(productosFiltrados.length);

         // Mostrar mensaje si no hay resultados
         if (productosFiltrados.length === 0) {
             container.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">No se encontraron productos que coincidan con "${termino}"</td></tr>`;
         }
    },

    // NUEVA: Renderiza cualquier lista de productos (filtrada o completa)
    
    renderizarInventarioConFiltro(productos) {
        const container = document.getElementById('inventoryTable');
        if (!container) return;

        container.innerHTML = '';

        if (productos.length === 0) {
            container.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-400">No hay productos para mostrar</td></tr>`;
            return;
        }

        productos.forEach(producto => {
            const row = this.crearFilaProducto(producto);
            container.appendChild(row);
        });

        // REFRESCAR ICONOS DE LUCIDE
        if (window.lucide) {
            lucide.createIcons();
        }

        // También mantener el refrescarIconos por compatibilidad
        if (typeof window.refrescarIconos === 'function') {
            window.refrescarIconos();
        }
    },

   

    // Modifica renderizarInventario para usar la función con filtro:
        renderizarInventario() {
            const productos = window.Sistema.estado.productos || [];
            this.todosLosProductos = productos; // Guardar para el filtro
            this.renderizarInventarioConFiltro(productos);
            this.mostrarResultadosInventario(productos.length);
    },

    // NUEVA: Muestra el contador de resultados
    mostrarResultadosInventario(count) {
        const container = document.getElementById('inventoryTable');
        if (!container) return;

        let counter = document.getElementById('inventorySearchResults');
        if (!counter) {
            counter = document.createElement('div');
            counter.id = 'inventorySearchResults';
            counter.className = 'text-xs text-slate-500 mt-2 text-right';
            container.parentElement.insertBefore(counter, container.nextSibling);
        }

        if (count === 0) {
            counter.textContent = 'No se encontraron resultados';
        } else {
            counter.textContent = `${count} producto${count !== 1 ? 's' : ''}`;
        }
    },

};

// Exponer globalmente
window.Inventario = Inventario;