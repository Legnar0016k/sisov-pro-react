/**
 * @file configuracion.js
 * @description Configuración del sistema y gestión de usuarios (UI).
 * [REFACTOR] Depende de AuthSecurity para la lógica de licencias.
 */

const Configuracion = {
    async actualizarTasa() {
        const input = document.getElementById('newRate');
        const tasa = parseFloat(input?.value);
        
        if (tasa && tasa > 0) {
            window.Sistema.estado.tasaBCV = tasa;
            window.Sistema.estado.config.tasaManual = true;
            window.Sistema.actualizarTasaUI();
            window.Sistema.mostrarToast('Tasa actualizada', 'success');
            if (input) input.value = '';
        } else {
            window.Sistema.mostrarToast('Ingrese una tasa válida', 'error');
        }
    },
    
    async abrirModalVendedor() {
        // [REFACTOR] Usar AuthSecurity para límites
        const disponibles = await window.AuthSecurity?.actualizarContadorVendedores() || 0;
        const limite = await window.AuthSecurity?.obtenerLimiteVendedores() || 0;
        const actuales = await window.AuthSecurity?.contarVendedoresActuales() || 0;
        
        if (actuales >= limite) {
            Swal.fire({
                icon: 'error',
                title: 'Límite Alcanzado',
                text: `Has alcanzado el límite de ${limite} vendedores.`,
                confirmButtonText: 'Entendido'
            });
            return;
        }
        
        const { value: datos } = await Swal.fire({
            title: 'Registrar Vendedor',
            html: `
                <div class="space-y-4 text-left">
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Nombres *</label>
                        <input type="text" id="vendedorNombres" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="Ej: Juan Carlos">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Apellidos *</label>
                        <input type="text" id="vendedorApellidos" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="Ej: Rodríguez Pérez">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Cédula *</label>
                        <input type="text" id="vendedorCedula" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="V-12345678">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Teléfono</label>
                        <input type="text" id="vendedorTelefono" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="0412-1234567">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Email *</label>
                        <input type="email" id="vendedorEmail" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="vendedor@email.com">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Contraseña *</label>
                        <input type="password" id="vendedorPassword" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="••••••••">
                    </div>
                    <div class="text-xs text-slate-500">* Campos obligatorios</div>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Registrar',
            cancelButtonText: 'Cancelar',
            width: 600,
            preConfirm: () => {
                const nombres = document.getElementById('vendedorNombres')?.value.trim();
                const apellidos = document.getElementById('vendedorApellidos')?.value.trim();
                const cedula = document.getElementById('vendedorCedula')?.value.trim();
                const telefono = document.getElementById('vendedorTelefono')?.value.trim();
                const email = document.getElementById('vendedorEmail')?.value.trim();
                const password = document.getElementById('vendedorPassword')?.value.trim();
                
                if (!nombres || !apellidos || !cedula || !email || !password) {
                    Swal.showValidationMessage('Complete todos los campos obligatorios');
                    return false;
                }
                
                return { nombres, apellidos, cedula, telefono, email, password };
            }
        });
        
        if (datos) {
            await this.registrarVendedor(datos);
        }
    },
    
    async registrarVendedor(datos) {
        try {
            const admin = window.pb.authStore.model;
            
            const existentes = await window.pb.collection('vendedores').getFullList({
                filter: `email = "${datos.email}"`,
                requestKey: `validar_email_${Date.now()}`,
                $autoCancel: false
            });
            
            if (existentes.length > 0) {
                throw new Error("El email ya está registrado");
            }
            
            const username = datos.email.split('@')[0] + '_' + Math.floor(Math.random() * 1000);
            
            const vendedorData = {
                username: username,
                email: datos.email,
                password: datos.password,
                passwordConfirm: datos.password,
                admin_id: admin.id,
                name: datos.nombres,
                lastname: datos.apellidos,
                cedula: datos.cedula,
                telefono: datos.telefono || '',
                user_role: 'vendedor',
                conectado: false
            };
            
            await window.pb.collection('vendedores').create(vendedorData, {
                requestKey: `crear_vendedor_${Date.now()}`,
                $autoCancel: false
            });
            
            await window.Sistema.registrarLog('VENDEDOR_CREADO', {
                email: datos.email,
                nombre: `${datos.nombres} ${datos.apellidos}`,
                admin_id: admin.id
            });
            
            window.Sistema.mostrarToast('Vendedor registrado', 'success');
            
            await this.cargarUsuarios();
            // [REFACTOR] Actualizar contador desde AuthSecurity
            await window.AuthSecurity?.actualizarContadorVendedores();
            
        } catch (error) {
            console.error('Error:', error);
            window.Sistema.mostrarToast(error.message || 'Error al registrar', 'error');
        }
    },
    
    async cargarUsuarios() {
        try {
            const admin = window.pb.authStore.model;
            if (!admin) return;
            
            const vendedores = await window.pb.collection('vendedores').getFullList({
                filter: `admin_id = "${admin.id}"`,
                sort: '-created',
                requestKey: `usuarios_${Date.now()}`,
                $autoCancel: false
            });
            
            const container = document.getElementById('usersList');
            if (!container) return;
            
            container.innerHTML = '';
            
            const adminDiv = this.crearItemAdmin(admin);
            container.appendChild(adminDiv);
            
            if (vendedores.length === 0) {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'text-center py-4 text-slate-400 text-sm bg-slate-50 rounded-lg mt-2';
                emptyDiv.innerHTML = 'No hay vendedores registrados';
                container.appendChild(emptyDiv);
            } else {
                vendedores.forEach(v => {
                    const userDiv = this.crearItemVendedor(v);
                    container.appendChild(userDiv);
                });
            }
            
            if (window.lucide) lucide.createIcons();
            
        } catch (error) {
            console.error('Error:', error);
            window.Sistema.mostrarToast('Error cargando usuarios', 'error');
        }
    },
    
    crearItemAdmin(admin) {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200';
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-gradient-to-br from-primary to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                    ${admin.user_name?.charAt(0) || admin.email.charAt(0).toUpperCase()}
                </div>
                <div>
                    <h4 class="font-semibold text-slate-800">${admin.user_name || 'Administrador'}</h4>
                    <p class="text-sm text-slate-500">${admin.email}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <span class="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-lg">admin</span>
                <span class="text-xs text-emerald-600">✓</span>
            </div>
        `;
        return div;
    },
    
    crearItemVendedor(v) {
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200';
        
        const estado = v.conectado ? '🟢 En línea' : '⚪ Desconectado';
        const estadoColor = v.conectado ? 'text-emerald-600' : 'text-slate-400';
        
        div.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full flex items-center justify-center text-white font-bold">
                    ${v.name?.charAt(0) || 'V'}
                </div>
                <div>
                    <h4 class="font-semibold text-slate-800">${v.name} ${v.lastname || ''}</h4>
                    <p class="text-sm text-slate-500">C.I: ${v.cedula || 'N/A'} | 📞 ${v.telefono || 'N/A'}</p>
                    <p class="text-xs text-slate-400">${v.email}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <span class="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-lg">vendedor</span>
                <span class="text-xs ${estadoColor}">${estado}</span>
            </div>
        `;
        return div;
    },
    
    async abrirModalRenovacion() {
        const { value: key } = await Swal.fire({
            title: 'Renovar Licencia',
            html: `
                <div class="space-y-4">
                    <p class="text-sm text-slate-600">Ingresa tu nueva clave de licencia</p>
                    <input type="text" id="licenciaKey" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="XXXXX-XXXXX-XXXXX">
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Activar',
            cancelButtonText: 'Cancelar',
            preConfirm: () => {
                const key = document.getElementById('licenciaKey')?.value.trim();
                if (!key) {
                    Swal.showValidationMessage('Ingrese una clave');
                    return false;
                }
                return key;
            }
        });
        
        if (key) {
            // [REFACTOR] Delegar a AuthSecurity
            await window.AuthSecurity?.activarLicencia(key);
        }
    },
    
    // [REFACTOR] Este método ahora llama a AuthSecurity
    copiarLicencia() {
        window.AuthSecurity?.copiarLicenciaAlPortapapeles();
    }
};

window.Configuracion = Configuracion;
window.copiarLicencia = () => Configuracion.copiarLicencia();