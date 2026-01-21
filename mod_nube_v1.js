/**
 * ARCHIVO: mod_nube_v1.js
 * DESCRIPCIÓN: Capa de compatibilidad para Railway (SISOV PRO v3.0)
 * ID: OVERRIDE-CLOUD-V9
 */

(function() {
    console.log("%c[MOD] Inyectando capa de compatibilidad Cloud...", "color: #3b82f6; font-weight: bold;");

    // 1. Forzar URL de producción si detecta que estamos en GitHub Pages o Railway
    if (window.location.hostname !== '127.0.0.1' && window.location.hostname !== 'localhost') {
        if (window.pb) {
            window.pb.baseUrl = 'https://sisov-pro-react-production.up.railway.app';
            console.log("%c[MOD] URL de PocketBase redirigida a Producción", "color: #10b981");
        }
    }

    // 2. INTERCEPTOR QUIRÚRGICO: Mejorar la función cargarUsuarios sin borrar la original
    const originalCargarUsuarios = window.Sistema?.cargarUsuarios;
    
    if (window.Sistema) {
        window.Sistema.cargarUsuarios = async function() {
            console.log("%c[MOD] Ejecutando versión mejorada de cargarUsuarios", "color: #8b5cf6");
            try {
                // Usamos la colección 'users' (nombre correcto en la nube)
                const usuarios = await pb.collection('users').getFullList({ sort: '-created' });
                const container = document.getElementById('usersList');
                
                if (container) {
                    container.innerHTML = '';
                    usuarios.forEach(u => {
                        const div = document.createElement('div');
                        div.className = 'flex items-center justify-between p-4 bg-white/10 rounded-lg border border-white/10 mb-2 text-white';
                        div.innerHTML = `
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 bg-primary rounded-full flex items-center justify-center font-bold">
                                    ${(u.user_name || u.email).charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p class="font-medium">${u.user_name || 'Sin nombre'}</p>
                                    <p class="text-xs text-slate-400">${u.email}</p>
                                </div>
                            </div>
                            <span class="text-[10px] bg-slate-700 px-2 py-1 rounded">${u.user_role}</span>
                        `;
                        container.appendChild(div);
                    });
                }
                console.log("%c[SUCCESS] Lista actualizada vía MOD", "color: #10b981");
            } catch (err) {
                console.error("[MOD ERROR]", err);
            }
        };
    }
})();