/**
 * @file reportes.js
 * @description Módulo de reportes - VERSIÓN COMPLETA
 */

const Reportes = {
    chartInstancia: null,
    ultimasVentas: [],
    
    async cargarReportes() {
        try {
            let fechaSeleccionada = document.getElementById('reportDate')?.value;
            
            if (!fechaSeleccionada) {
                fechaSeleccionada = new Date().toISOString().split('T')[0];
                const input = document.getElementById('reportDate');
                if (input) input.value = fechaSeleccionada;
            }
            
            await Promise.all([
                this.cargarDatosVentas(fechaSeleccionada),
                this.cargarGraficoSemanal(fechaSeleccionada)
            ]);
            
        } catch (error) {
            window.Sistema?.manejarError('cargar_reportes', error);
        }
    },
    
    async cargarDatosVentas(fecha) {
        try {
            const user = window.pb?.authStore?.model;
            if (!user) {
                console.warn("[REPORTES] No hay usuario autenticado");
                return;
            }
            
            const fechaConsulta = fecha || new Date().toISOString().split('T')[0];
            const filtro = `user_id = "${user.id}" && id_fecha = "${fechaConsulta}"`;
            
            console.log(`[REPORTES] Consultando: ${filtro}`);
            
            const ventas = await window.pb.collection('sales').getFullList({
                filter: filtro,
                sort: '-created',
                requestKey: `ventas_${Date.now()}`,
                $autoCancel: false
            });
            
            this.ultimasVentas = ventas;
            
            const totalUSD = ventas.reduce((sum, v) => sum + (v.total_usd || 0), 0);
            const totalVES = ventas.reduce((sum, v) => sum + (v.total_ves || 0), 0);
            
            this.setText('ventasHoyUSD', window.Sistema?.formatearMoneda(totalUSD) || `$${totalUSD.toFixed(2)}`);
            this.setText('ventasHoyVES', window.Sistema?.formatearMoneda(totalVES, 'VES') || `${totalVES.toFixed(2)} Bs`);
            this.setText('transaccionesHoy', ventas.length.toString());
            
            this.renderizarTabla(ventas);
            this.procesarTopProductos(ventas);
            
        } catch (error) {
            console.error('[REPORTES] Error:', error);
            window.Sistema?.mostrarToast('Error cargando ventas', 'error');
        }
    },
    
    renderizarTabla(ventas) {
        const container = document.getElementById('salesTable');
        if (!container) return;
        
        if (ventas.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="6" class="p-8 text-center text-slate-400">
                        <i data-lucide="file-text" class="w-12 h-12 mx-auto mb-3 opacity-30"></i>
                        <p>No hay ventas en esta fecha</p>
                        <p class="text-xs mt-2">Selecciona otra fecha o realiza tu primera venta</p>
                    </td>
                </tr>
            `;
            this.mostrarResultados(0);
            if (window.lucide) lucide.createIcons();
            return;
        }
        
        container.innerHTML = ventas.map(v => {
            const fecha = new Date(v.created);
            const hora = fecha.toLocaleTimeString('es-VE', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
            });
            
            return `
            <tr class="hover:bg-slate-50 border-b border-slate-100 transition-colors">
                <td class="p-4">
                    <div class="font-mono text-xs font-bold text-slate-700">
                        ${v.n_factura || v.id.slice(0,8)}
                    </div>
                    <div class="text-[10px] text-slate-400">
                        ${v.id_fecha || ''}
                    </div>
                </td>
                <td class="p-4 text-sm text-slate-500">
                    ${hora}
                </td>
                <td class="p-4">
                    <span class="px-2 py-1 rounded-lg font-bold text-[10px] uppercase ${this.obtenerColorPago(v.payment_method)}">
                        ${this.formatearMetodoPago(v.payment_method)}
                    </span>
                </td>
                <td class="p-4 text-base font-black text-emerald-600">
                    ${window.Sistema?.formatearMoneda(v.total_usd) || `$${v.total_usd?.toFixed(2)}`}
                </td>
                <td class="p-4 text-base font-black text-purple-600">
                    ${window.Sistema?.formatearMoneda(v.total_ves, 'VES') || `${v.total_ves?.toFixed(2)} Bs`}
                </td>
                <td class="p-4">
                    <div class="flex justify-center gap-1">
                        <button onclick="Reportes.verDetalleVenta('${v.id}')" 
                                class="p-2 hover:bg-indigo-100 rounded-xl text-primary transition-all"
                                title="Ver detalle">
                            <i data-lucide="eye" class="w-4 h-4"></i>
                        </button>
                        <button onclick="Reportes.generarPDFVenta('${v.id}')" 
                                class="p-2 hover:bg-emerald-100 rounded-xl text-emerald-600 transition-all"
                                title="Descargar PDF">
                            <i data-lucide="file-down" class="w-4 h-4"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `}).join('');
        
        this.mostrarResultados(ventas.length);
        
        if (window.lucide) lucide.createIcons();
    },
    
    formatearMetodoPago(metodo) {
        const metodos = {
            'EFECTIVO': 'EFECTIVO',
            'PAGO_MOVIL': 'PAGO MÓVIL',
            'DEBITO': 'DÉBITO',
            'DIVISAS': 'DIVISAS',
            'TRANSFERENCIA': 'TRANSFERENCIA',
            'ZELLE': 'ZELLE'
        };
        return metodos[metodo] || metodo || 'EFECTIVO';
    },
    
    obtenerColorPago(metodo) {
        const colores = {
            'EFECTIVO': 'bg-emerald-100 text-emerald-700',
            'PAGO_MOVIL': 'bg-blue-100 text-blue-700',
            'DEBITO': 'bg-cyan-100 text-cyan-700',
            'DIVISAS': 'bg-amber-100 text-amber-700',
            'TRANSFERENCIA': 'bg-slate-100 text-slate-700',
            'ZELLE': 'bg-purple-100 text-purple-700'
        };
        return colores[metodo] || 'bg-slate-100 text-slate-700';
    },
    
    mostrarResultados(count) {
        const container = document.getElementById('salesTable');
        if (!container) return;
        
        let counter = document.getElementById('searchResultsCounter');
        if (!counter) {
            counter = document.createElement('div');
            counter.id = 'searchResultsCounter';
            counter.className = 'text-xs text-slate-500 mt-2 text-right';
            container.parentElement.insertBefore(counter, container.nextSibling);
        }
        
        if (count === 0) {
            counter.textContent = 'No hay resultados';
            counter.className = 'text-xs text-slate-400 mt-2 text-right';
        } else {
            counter.textContent = `${count} venta${count !== 1 ? 's' : ''}`;
            counter.className = 'text-xs text-slate-500 mt-2 text-right font-medium';
        }
    },
    
    procesarTopProductos(ventas) {
        const conteo = {};
        
        ventas.forEach(v => {
            if (v.items) {
                try {
                    const items = typeof v.items === 'string' ? JSON.parse(v.items) : v.items;
                    if (Array.isArray(items)) {
                        items.forEach(item => {
                            const nombre = item.producto || item.nombre || 'Producto';
                            conteo[nombre] = (conteo[nombre] || 0) + (item.cantidad || 1);
                        });
                    }
                } catch (e) {
                    console.warn('[REPORTES] Error parseando items:', e);
                }
            }
        });
        
        const top = Object.entries(conteo)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        const container = document.getElementById('topProducts');
        if (!container) return;
        
        if (top.length === 0) {
            container.innerHTML = `
                <div class="text-center py-6">
                    <i data-lucide="package" class="w-8 h-8 mx-auto text-slate-300 mb-2"></i>
                    <p class="text-sm text-slate-400">No hay productos vendidos</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }
        
        container.innerHTML = top.map(([nombre, cant], i) => `
            <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-slate-100 transition-colors">
                <div class="flex items-center gap-3 min-w-0">
                    <span class="w-6 h-6 flex items-center justify-center bg-indigo-600 text-white text-[10px] font-bold rounded-md shadow-sm">${i+1}</span>
                    <span class="text-sm font-medium text-slate-700 truncate" title="${nombre}">${nombre}</span>
                </div>
                <span class="text-xs font-bold bg-white px-2 py-1 rounded-lg shadow-sm text-indigo-600 border border-indigo-100">
                    ${cant} ${cant === 1 ? 'unidad' : 'unidades'}
                </span>
            </div>
        `).join('');
        
        if (window.lucide) lucide.createIcons();
    },
    
     async cargarGraficoSemanal(fechaRef) {
        try {
            const ctx = document.getElementById('salesChart');
            if (!ctx) return;

            if (this.chartInstancia) {
                this.chartInstancia.destroy();
            }

            const user = window.pb.authStore.model;
            if (!user) return;

            const fechaFin = new Date(fechaRef);
            const fechaInicio = new Date(fechaRef);
            fechaInicio.setDate(fechaInicio.getDate() - 6);

            const ventas = await window.pb.collection('sales').getFullList({
                filter: `user_id = "${user.id}" && created >= "${fechaInicio.toISOString().split('T')[0]} 00:00:00" && created <= "${fechaFin.toISOString().split('T')[0]} 23:59:59"`,
                sort: 'created',
                requestKey: 'grafico_' + Date.now(),
                $autoCancel: false
            });

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
                    maintainAspectRatio: false,
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
    
    buscarEnReportes(termino) {
        const container = document.getElementById('salesTable');
        if (!container) return;
        
        if (!this.ultimasVentas || this.ultimasVentas.length === 0) {
            return;
        }
        
        termino = termino.toLowerCase().trim();
        
        if (termino === '') {
            this.renderizarTabla(this.ultimasVentas);
            return;
        }
        
        const filtradas = this.ultimasVentas.filter(v => {
            const factura = (v.n_factura || v.id).toLowerCase();
            const fecha = new Date(v.created).toLocaleDateString().toLowerCase();
            const metodo = (v.payment_method || '').toLowerCase();
            const totalUSD = v.total_usd?.toString() || '';
            const totalVES = v.total_ves?.toString() || '';
            
            return factura.includes(termino) ||
                   fecha.includes(termino) ||
                   metodo.includes(termino) ||
                   totalUSD.includes(termino) ||
                   totalVES.includes(termino);
        });
        
        if (filtradas.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="6" class="p-8 text-center text-slate-400">
                        <i data-lucide="search-x" class="w-12 h-12 mx-auto mb-3 opacity-30"></i>
                        <p>No se encontraron ventas para "${termino}"</p>
                    </td>
                </tr>
            `;
            this.mostrarResultados(0);
        } else {
            this.renderizarTabla(filtradas);
        }
        
        if (window.lucide) lucide.createIcons();
    },
    
    async verDetalleVenta(ventaId) {
        try {
            const venta = await window.pb.collection('sales').getOne(ventaId, { 
                requestKey: `detalle_${Date.now()}`, 
                $autoCancel: false 
            });
            
            const fecha = new Date(venta.created).toLocaleString('es-VE', {
                dateStyle: 'full',
                timeStyle: 'medium'
            });
            
            const items = typeof venta.items === 'string' ? JSON.parse(venta.items) : venta.items;
            
            let itemsHtml = '';
            if (Array.isArray(items) && items.length > 0) {
                itemsHtml = items.map(item => `
                    <tr>
                        <td class="py-1">${item.producto || item.nombre || 'Producto'}</td>
                        <td class="py-1 text-center">${item.cantidad || 1}</td>
                        <td class="py-1 text-right">${window.Sistema?.formatearMoneda(item.precio_unitario || 0)}</td>
                        <td class="py-1 text-right">${window.Sistema?.formatearMoneda((item.precio_unitario || 0) * (item.cantidad || 1))}</td>
                    </tr>
                `).join('');
            }
            
            Swal.fire({
                title: `Factura: ${venta.n_factura || venta.id.slice(0,8)}`,
                html: `
                    <div class="text-left max-h-[400px] overflow-y-auto">
                        <div class="bg-slate-50 p-3 rounded-lg mb-4 text-sm">
                            <p><span class="font-semibold">Fecha:</span> ${fecha}</p>
                            <p><span class="font-semibold">Cliente:</span> ${venta.user_email || 'Mostrador'}</p>
                            <p><span class="font-semibold">Método:</span> ${this.formatearMetodoPago(venta.payment_method)}</p>
                            <p><span class="font-semibold">Tasa BCV:</span> ${venta.dolartoday?.toFixed(2) || window.Sistema?.estado?.tasaBCV?.toFixed(2) || '0.00'} Bs/$</p>
                        </div>
                        
                        <h4 class="font-bold text-sm mb-2">Productos:</h4>
                        <table class="w-full text-sm mb-4">
                            <thead class="border-b border-slate-200">
                                <tr>
                                    <th class="py-2 text-left">Producto</th>
                                    <th class="py-2 text-center">Cant.</th>
                                    <th class="py-2 text-right">Precio</th>
                                    <th class="py-2 text-right">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsHtml || '<tr><td colspan="4" class="py-4 text-center text-slate-400">No hay productos</td></tr>'}
                            </tbody>
                        </table>
                        
                        <div class="border-t border-slate-200 pt-3 mt-3">
                            <div class="flex justify-between text-base font-bold">
                                <span>Total USD:</span>
                                <span class="text-emerald-600">${window.Sistema?.formatearMoneda(venta.total_usd)}</span>
                            </div>
                            <div class="flex justify-between text-base font-bold mt-1">
                                <span>Total Bs:</span>
                                <span class="text-purple-600">${window.Sistema?.formatearMoneda(venta.total_ves, 'VES')}</span>
                            </div>
                        </div>
                        
                        <div class="flex justify-center gap-3 mt-6">
                            <button onclick="Reportes.generarPDFVenta('${venta.id}')" 
                                    class="btn-primary px-6 py-3 rounded-xl text-white font-bold flex items-center gap-2">
                                <i data-lucide="file-down" class="w-4 h-4"></i>
                                Descargar PDF
                            </button>
                        </div>
                    </div>
                `,
                width: 600,
                showConfirmButton: false,
                showCloseButton: true,
                didOpen: () => {
                    if (window.lucide) lucide.createIcons();
                }
            });
            
        } catch (error) {
            console.error('[REPORTES] Error:', error);
            window.Sistema?.mostrarToast('Error al cargar detalle', 'error');
        }
    },
    
     async generarPDFVenta(id) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: [80, 160] }); 
        
        try {
            const v = await window.pb.collection('sales').getOne(id);
            
            doc.setTextColor(0, 0, 0);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text('SISOV PRO v3.0', 40, 10, { align: 'center' });
            
            doc.setLineWidth(0.1);
            doc.line(5, 12, 75, 12);
            doc.line(5, 13, 75, 13);
            
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.text(`Factura: ${v.n_factura || v.id.toUpperCase()}`, 10, 22);
            doc.text(`Fecha: ${new Date(v.created).toLocaleString()}`, 10, 27);
            doc.text(`Cliente: ${v.user_email || 'Mostrador'}`, 10, 32);
            
            doc.setDrawColor(200, 200, 200);
            doc.line(5, 37, 75, 37);
            
            let y = 43;
            doc.setFont("helvetica", "bold");
            doc.text('CANT.   DESCRIPCIÓN', 10, y);
            doc.text('TOTAL', 70, y, { align: 'right' });
            y += 4;
            
            doc.setFont("helvetica", "normal");
            const items = typeof v.items === 'string' ? JSON.parse(v.items) : v.items;
            items.forEach(item => {
                doc.text(`${item.cantidad}x`, 10, y);
                doc.text(`${item.producto.substring(0,22)}`, 20, y);
                doc.text(`$${(item.cantidad * item.precio_unitario).toFixed(2)}`, 70, y, { align: 'right' });
                y += 5;
            });
            
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
            
            y += 15;
            doc.setFontSize(7);
            doc.setFont("helvetica", "italic");
            doc.text('Comprobante de Pago Digital', 40, y, { align: 'center' });
            doc.text('No representa factura fiscal', 40, y + 4, { align: 'center' });
            doc.text('*** Gracias por su Compra ***', 40, y + 10, { align: 'center' });

            doc.save(`Factura_${v.n_factura || v.id}.pdf`);
            window.Sistema.mostrarToast('PDF generado (Modo Ahorro)', 'success');
        } catch (e) {
            console.error('Error PDF:', e);
            window.Sistema.mostrarToast('Error al generar PDF', 'error');
        }
    },
    
    async exportarPDF() {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const fechaReporte = document.getElementById('reportDate').value || new Date().toISOString().split('T')[0];
        
        try {
            window.Sistema.mostrarToast('Generando informe profesional...', 'info');
            
            const user = window.pb.authStore.model;
            if (!user) {
                window.Sistema.mostrarToast('Usuario no autenticado', 'error');
                return;
            }
            
            const filtro = `user_id = "${user.id}" && id_fecha = "${fechaReporte}"`;
            const ventas = await window.pb.collection('sales').getFullList({
                filter: filtro,
                sort: 'created',
                requestKey: 'exportar_pdf_' + Date.now(),
                $autoCancel: false
            });

            if (ventas.length === 0) {
                window.Sistema.mostrarToast('No hay ventas en esta fecha', 'warning');
                return;
            }

            const totalUSD = ventas.reduce((sum, v) => sum + v.total_usd, 0);
            const totalVES = ventas.reduce((sum, v) => sum + v.total_ves, 0);
            
            const resumenMetodos = ventas.reduce((acc, v) => {
                acc[v.payment_method] = (acc[v.payment_method] || 0) + v.total_usd;
                return acc;
            }, {});

            const usuarioLogueado = user.email;

            // DISEÑO DEL PDF
            doc.setFillColor(248, 250, 252);
            doc.rect(0, 0, 210, 40, 'F');
            
            doc.setTextColor(30, 41, 59);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(22);
            doc.text('SISOV PRO v3.0', 20, 20);
            
            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139);
            doc.text('SISTEMA DE GESTIÓN DE VENTAS E INVENTARIO', 20, 27);
            
            doc.setFont("helvetica", "normal");
            doc.text(`Usuario: ${usuarioLogueado}`, 20, 33);
            
            doc.setTextColor(30, 41, 59);
            doc.setFontSize(12);
            doc.text(`REPORTE DIARIO: ${fechaReporte}`, 190, 20, { align: 'right' });
            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.text(`Generado: ${new Date().toLocaleString()}`, 190, 27, { align: 'right' });

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
            window.Sistema.mostrarToast('Informe generado', 'success');
            
        } catch (error) {
            console.error('Error reporte:', error);
            window.Sistema.mostrarToast('Error al generar informe', 'error');
        }
    },
    
    setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }
};

// Exponer globalmente
window.Reportes = Reportes;