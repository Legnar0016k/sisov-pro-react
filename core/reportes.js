//======================================================//
//=====================REPORTES.JS========================//
//======================================================//

const Reportes = {
    chartInstancia: null,
    
    async cargarReportes() {
        let fechaSeleccionada = document.getElementById('reportDate').value;
        if (!fechaSeleccionada) { // ← CORREGIDO: era "fleta"
            fechaSeleccionada = new Date().toISOString().split('T')[0];
            document.getElementById('reportDate').value = fechaSeleccionada;
        }

        console.log(`[REPORTES] Consultando ventas para fecha: ${fechaSeleccionada}`);

        await Promise.all([
            this.cargarDatosVentas(fechaSeleccionada),
            this.cargarGraficoSemanal(fechaSeleccionada)
        ]);
    },

    async cargarDatosVentas(fecha) {
        try {
            const user = window.pb.authStore.model;
            if (!user) {
                console.warn("[REPORTES] No hay usuario autenticado");
                return;
            }
        
            const fechaConsulta = fecha || window.Sistema.estado.config.serverTime.toISOString().split('T')[0];
            
            const filtro = `user_id = "${user.id}" && id_fecha = "${fechaConsulta}"`;
            
            console.log(`[REPORTES] Filtro aplicado: ${filtro}`);
            
            const ventas = await window.pb.collection('sales').getFullList({
                filter: filtro,
                sort: '-created',
                requestKey: 'carga_ventas_' + Date.now(),
                $autoCancel: false
            });
        
            console.log(`[REPORTES] Ventas encontradas: ${ventas.length}`);
        
            // GUARDAR LAS VENTAS ORIGINALES PARA EL FILTRO
            this.ultimasVentas = ventas;
        
            const totalUSD = ventas.reduce((sum, v) => sum + (v.total_usd || 0), 0);
            const totalVES = ventas.reduce((sum, v) => sum + (v.total_ves || 0), 0);
        
            const ventasHoyUSD = document.getElementById('ventasHoyUSD');
            const ventasHoyVES = document.getElementById('ventasHoyVES');
            const transaccionesHoy = document.getElementById('transaccionesHoy');
            
            if (ventasHoyUSD) ventasHoyUSD.textContent = window.Sistema.formatearMoneda(totalUSD);
            if (ventasHoyVES) ventasHoyVES.textContent = window.Sistema.formatearMoneda(totalVES, 'VES');
            if (transaccionesHoy) transaccionesHoy.textContent = ventas.length;
        
            this.renderizarTabla(ventas);
            this.procesarTopProductos(ventas);
        
            // ← Aseguramos que el contador se muestre incluso si no hay ventas
            if (ventas.length === 0) {
                this.mostrarResultados(0);
            }
        
        } catch (error) {
            console.error('Error en cargarDatosVentas:', error);
            window.Sistema.mostrarToast('Error al cargar datos históricos', 'error');
        }
    },
    
    // muestra la tabla de ventas, se llama desde cargarDatosVentas y buscarEnReportes
    renderizarTabla(ventas) {
        const container = document.getElementById('salesTable');
        if (!container) return;

        if (ventas.length === 0) {
            container.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">No hay ventas registradas en esta fecha.</td></tr>`;
            // ← IMPORTANTE: Llamar a mostrarResultados incluso cuando no hay ventas
            this.mostrarResultados(0);
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
                    ${window.Sistema.formatearMoneda(v.total_usd)}
                </td>
                <td class="p-4 text-base font-black text-purple-600">
                    ${window.Sistema.formatearMoneda(v.total_ves, 'VES')}
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
        
        if (window.lucide) lucide.createIcons();
        
        // muestra la cantidad de resultados encontrados debajo de la tabla
        this.mostrarResultados(ventas.length);
    },

    // nueva logica para mostrar cantidad de resultados encontrados debajo de la tabla, se llama desde renderizarTabla y buscarEnReportes
    mostrarResultados(count) {
        const container = document.getElementById('salesTable');
        if (!container) return;
        
        // Crear o actualizar un elemento para mostrar el contador
        let counter = document.getElementById('searchResultsCounter');
        if (!counter) {
            counter = document.createElement('div');
            counter.id = 'searchResultsCounter';
            counter.className = 'text-xs text-slate-500 mt-2 text-right';
            container.parentElement.insertBefore(counter, container.nextSibling);
        }

        if (count === 0) {
            counter.textContent = 'No se encontraron resultados';
        } else {
            counter.textContent = `${count} resultado${count !== 1 ? 's' : ''}`;
        }
    },
    
    obtenerColorPago(metodo) {
        const colores = {
            'EFECTIVO': 'bg-emerald-100 text-emerald-700',
            'PAGO MOVIL': 'bg-blue-100 text-blue-700',
            'DEBITO': 'bg-cyan-100 text-cyan-700 border border-cyan-200',
            'ZELLE': 'bg-purple-100 text-purple-700',
            'TRANSFERENCIA': 'bg-slate-100 text-slate-700',
            'DIVISAS': 'bg-amber-100 text-amber-700'
        };
        return colores[metodo] || 'bg-slate-100 text-slate-700';
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
    
    procesarTopProductos(ventas) {
        const conteo = {};
        ventas.forEach(v => {
            if (v.items) {
                // Parsear items si es string
                const items = typeof v.items === 'string' ? JSON.parse(v.items) : v.items;
                items.forEach(item => {
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

    
    // se añade filtro para la tabla de ventas
    buscarEnReportes(termino) {
        const container = document.getElementById('salesTable');
        if (!container) return;

        if (!this.ultimasVentas) {
            console.warn("[REPORTES] No hay ventas cargadas para filtrar");
            return;
        }

        termino = termino.toLowerCase().trim();

        if (termino === '') {
            // Si el término está vacío, mostrar todas las ventas
            this.renderizarTabla(this.ultimasVentas);
            this.mostrarResultados(this.ultimasVentas.length); // ← Actualizar contador
            return;
        }

        // Filtrar ventas por término en múltiples campos
        const ventasFiltradas = this.ultimasVentas.filter(v => {
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

        this.renderizarTabla(ventasFiltradas);
        this.mostrarResultados(ventasFiltradas.length); // ← Actualizar contador

        // Mostrar mensaje si no hay resultados
        if (ventasFiltradas.length === 0) {
            container.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-400">No se encontraron ventas que coincidan con "${termino}"</td></tr>`;
        }
    },


    async verDetalleVenta(ventaId) {
        try {
            const venta = await window.pb.collection('sales').getOne(ventaId, { requestKey: null });
            
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
                                `<li>${item.producto} - ${item.cantidad} x ${window.Sistema.formatearMoneda(item.precio_unitario)}</li>`
                            ).join('') : '<li>Sin productos</li>'}
                        </ul>
                        <hr class="my-3">
                        <p><strong>Total USD:</strong> ${window.Sistema.formatearMoneda(venta.total_usd)}</p>
                        <p><strong>Total Bs:</strong> ${window.Sistema.formatearMoneda(venta.total_ves, 'VES')}</p>
                        <p><strong>Tasa BCV:</strong> ${venta.dolartoday || '382.63'}</p>
                    </div>
                `,
                confirmButtonText: 'Cerrar',
                didOpen: () => lucide.createIcons()
            });
            
        } catch (error) {
            console.error('Error:', error);
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
    }
};

// Exponer globalmente
window.Reportes = Reportes;
