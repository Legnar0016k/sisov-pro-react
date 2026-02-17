//======================================================//
//===================CONFIGURACION.JS=====================//
//======================================================//

const Configuracion = {
    async actualizarTasa() {
        const input = document.getElementById('newRate');
        const tasa = parseFloat(input.value);
        
        if (tasa && tasa > 0) {
            window.Sistema.estado.tasaBCV = tasa;
            window.Sistema.estado.config.tasaManual = true;
            window.Sistema.actualizarTasaUI();
            window.Sistema.mostrarToast('Tasa actualizada correctamente', 'success');
            input.value = '';
        } else {
            window.Sistema.mostrarToast('Ingrese una tasa válida', 'error');
        }
    },
    
    // Función para abrir modal de nuevo vendedor
    async abrirModalVendedor() {
        // Verificar si hay cupos disponibles
        const disponibles = await window.GestionLicencias?.actualizarContadorVendedores() || 0;
        const limite = await window.GestionLicencias?.obtenerLimiteVendedores() || 0;
        const actuales = await window.GestionLicencias?.contarVendedoresActuales() || 0;
        
        if (actuales >= limite) {
            Swal.fire({
                icon: 'error',
                title: 'Límite Alcanzado',
                text: `Has alcanzado el límite de ${limite} vendedores permitidos por tu licencia.`,
                confirmButtonText: 'Entendido'
            });
            return;
        }
        
        // Mostrar modal para crear vendedor
        Swal.fire({
            title: 'Registrar Nuevo Vendedor',
            html: `
                <div class="space-y-4 text-left">
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Nombres</label>
                        <input type="text" id="vendedorNombres" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="Ej: Juan Carlos">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Apellidos</label>
                        <input type="text" id="vendedorApellidos" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="Ej: Rodríguez Pérez">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Cédula</label>
                        <input type="text" id="vendedorCedula" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="V-12345678">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Teléfono</label>
                        <input type="text" id="vendedorTelefono" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="0412-1234567">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Email (para acceso)</label>
                        <input type="email" id="vendedorEmail" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="vendedor@email.com">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Contraseña temporal</label>
                        <input type="password" id="vendedorPassword" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="••••••••">
                    </div>
                </div>
            `,
            focusConfirm: false,
            showCancelButton: true,
            confirmButtonText: 'Registrar Vendedor',
            cancelButtonText: 'Cancelar',
            preConfirm: async () => {
                const nombres = document.getElementById('vendedorNombres').value;
                const apellidos = document.getElementById('vendedorApellidos').value;
                const cedula = document.getElementById('vendedorCedula').value;
                const telefono = document.getElementById('vendedorTelefono').value;
                const email = document.getElementById('vendedorEmail').value;
                const password = document.getElementById('vendedorPassword').value;
                
                if (!nombres || !apellidos || !cedula || !email || !password) {
                    Swal.showValidationMessage('Todos los campos son requeridos');
                    return false;
                }
                
                return { nombres, apellidos, cedula, telefono, email, password };
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                await this.registrarVendedor(result.value);
            }
        });
    },
    
    // registro de los vendedores en la coleccion auth vendedores
    async registrarVendedor(datos) {
        try {
            const admin = window.pb.authStore.model;

            // Generar username único (requerido por colecciones auth)
            const username = datos.email.split('@')[0] + '_' + Date.now().toString().slice(-4);

            // Crear el vendedor en la colección vendedores (colección auth)
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
                conectado: false,
                hora_i: null,
                hora_f: null
            };

            console.log("[VENDEDOR] Creando con datos:", vendedorData);

            await window.pb.collection('vendedores').create(vendedorData);

            window.Sistema.mostrarToast('Vendedor registrado exitosamente', 'success');

            // Actualizar la lista de vendedores
            await this.cargarUsuarios();
            await window.GestionLicencias?.actualizarContadorVendedores();

        } catch (error) {
            console.error('Error registrando vendedor:', error);

            let mensajeError = 'Error al registrar vendedor';
            if (error.data && error.data.data) {
                const errores = Object.entries(error.data.data)
                    .map(([campo, err]) => `${campo}: ${err.message}`)
                    .join(', ');
                mensajeError = `Error: ${errores}`;
            }

            window.Sistema.mostrarToast(mensajeError, 'error');
        }
    },

    // logica para cargar los vendedores registrados y mostrarlos en el panel de usuarios        
    async cargarUsuarios() {
        try {
            const admin = window.pb.authStore.model;
            if (!admin) return;
            
            // Cargar vendedores con manejo de errores
            let vendedores = [];
            try {
                vendedores = await window.pb.collection('vendedores').getFullList({
                    filter: `admin_id = "${admin.id}"`,
                    sort: '-created',
                    requestKey: 'carga_vendedores_' + Date.now(),
                    $autoCancel: false
                });
            } catch (error) {
                console.warn("[VENDEDORES] Error cargando lista, intentando sin filtro:", error);
                // Intentar sin filtro y filtrar manualmente
                try {
                    const todos = await window.pb.collection('vendedores').getFullList({
                        requestKey: 'carga_vendedores_todos_' + Date.now(),
                        $autoCancel: false
                    });
                    vendedores = todos.filter(v => v.admin_id === admin.id);
                } catch (e) {
                    console.error("[VENDEDORES] No se puede acceder a la colección");
                }
            }
            
            const container = document.getElementById('usersList');
            if (!container) return;
            
            container.innerHTML = '';
            
            // Mostrar admin
            const adminDiv = document.createElement('div');
            adminDiv.className = 'flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200';
            adminDiv.innerHTML = `
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
                    <span class="badge badge-danger">admin</span>
                    <span class="text-xs text-emerald-600">✓ Verificado</span>
                </div>
            `;
            container.appendChild(adminDiv);
            
            // Mostrar vendedores
            if (vendedores.length === 0) {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'text-center py-4 text-slate-400 text-sm bg-slate-50 rounded-lg mt-2';
                emptyDiv.innerHTML = 'No hay vendedores registrados aún';
                container.appendChild(emptyDiv);
            } else {
                vendedores.forEach(v => {
                    const userDiv = document.createElement('div');
                    userDiv.className = 'flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200';
                    const estado = v.conectado ? '🟢 En línea' : '⚪ Desconectado';
                    const estadoColor = v.conectado ? 'text-emerald-600' : 'text-slate-400';
                    
                    userDiv.innerHTML = `
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
                            <span class="badge badge-warning">vendedor</span>
                            <span class="text-xs ${estadoColor}">${estado}</span>
                        </div>
                    `;
                    container.appendChild(userDiv);
                });
            }
            
            // Refrescar iconos
            if (window.lucide) lucide.createIcons();
            
            // Actualizar contador
            await window.GestionLicencias?.actualizarContadorVendedores();
            window.Sistema.mostrarToast('Lista actualizada', 'success');
            
        } catch (error) {
            console.error('Error cargando usuarios:', error);
            window.Sistema.mostrarToast('Error cargando usuarios', 'error');
        }
    },
    
    async abrirModalRenovacion() {
        Swal.fire({
            title: 'Renovar Licencia',
            html: `
                <div class="space-y-4 text-left">
                    <p class="text-sm text-slate-600">Ingresa tu nueva clave de licencia para renovar o actualizar tu plan.</p>
                    <div>
                        <label class="block text-sm font-semibold text-slate-700 mb-2">Clave de Licencia</label>
                        <input type="text" id="licenciaKey" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-primary outline-none" placeholder="XXXXX-XXXXX-XXXXX">
                    </div>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Activar Licencia',
            cancelButtonText: 'Cancelar',
            preConfirm: async () => {
                const key = document.getElementById('licenciaKey').value;
                if (!key) {
                    Swal.showValidationMessage('Ingrese una clave de licencia');
                    return false;
                }
                return key;
            }
        }).then(async (result) => {
            if (result.isConfirmed) {
                await this.activarLicencia(result.value);
            }
        });
    },
    
    async activarLicencia(key) {
        try {
            const user = window.pb.authStore.model;
            
            // Buscar la licencia por su key
            const licencias = await window.pb.collection('licencias').getFullList({
                filter: `key = "${key}"`
            });
            
            if (licencias.length === 0) {
                window.Sistema.mostrarToast('Clave de licencia no válida', 'error');
                return;
            }
            
            const licencia = licencias[0];
            
            // Verificar si ya está usada
            if (licencia.is_usada) {
                window.Sistema.mostrarToast('Esta licencia ya ha sido utilizada', 'error');
                return;
            }
            
            // Asignar licencia al usuario actual
            await window.pb.collection('licencias').update(licencia.id, {
                user_id: user.id,
                is_usada: true,
                active: true,
                estado: 'activa'
            });
            
            // Actualizar usuario con la licencia
            await window.pb.collection('users').update(user.id, {
                licence_id: licencia.id
            });
            
            window.Sistema.mostrarToast('Licencia activada exitosamente', 'success');
            
            // Recargar datos de licencia
            await window.GestionLicencias?.cargarLicenciaUsuario();
            
        } catch (error) {
            console.error('Error activando licencia:', error);
            window.Sistema.mostrarToast('Error al activar licencia', 'error');
        }
    },

    // nueva logica para copiar la clave de licencia al portapapeles desde el display
    copiarLicencia() {
        const licenciaKey = document.getElementById('licenciaKeyDisplay')?.title;
        if (licenciaKey) {
            navigator.clipboard.writeText(licenciaKey).then(() => {
                window.Sistema.mostrarToast('Clave copiada al portapapeles', 'success');
            }).catch(() => {
                window.Sistema.mostrarToast('Error al copiar', 'error');
            });
        }
    }
};

// Exponer globalmente
window.Configuracion = Configuracion;
window.copiarLicencia = function() {
    Configuracion.copiarLicencia();
};