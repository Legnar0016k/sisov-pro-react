/**
 * SISOV PRO v2.1 - Sistema Unificado Optimizado
 * Versión depurada, sin inconsistencias, lista para producción
 */

// Monitor Integrado (Colores según tus reglas)
const log = {
    info: (m) => console.log(`%c[INFO]: ${m}`, 'color: #0000FF'),
    success: (m) => console.log(`%c[ÉXITO]: ${m}`, 'color: #008000'),
    error: (m) => console.log(`%c[ERROR API]: ${m}`, 'color: #FF0000')
};
log.info("Cargando sistema desde Railway...");

// ==================== 1. INICIALIZACIÓN GLOBAL ====================
const pb = new PocketBase('https://sisov-pro-react-production.up.railway.app');

const state = {
    products: [],
    cart: [],
    // CAMBIA ESTA LÍNEA: NO cargar de localStorage al inicio
    bcv_rate: 0,  // Siempre empieza en 0
    isCartLocked: true,  // Siempre bloqueado al inicio
    activeUser: null,
    isProcessing: false,
    api_official_rate: 0,
    api_last_update: '',
    biz: {
        name: "SISOV PRO",
        rif: "J-00000000-0"
    }
};

let currentRestockId = null;
let currentPriceEditId = null;
let currentReduceId = null;
let currentInventoryFilter = 'all';
let isProcessingSale = false;
let html5QrCode = null;

// ==================== 2. SISTEMA DE NOTIFICACIONES ====================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const colors = {
        info: 'bg-green-600',
        success: 'bg-green-600',
        error: 'bg-red-500',
        warning: 'bg-amber-500'
    };
    
    const toast = document.createElement('div');
    toast.className = `px-6 py-3 rounded-xl shadow-2xl text-white text-[10px] font-black tracking-tighter animate-bounce ${colors[type] || 'bg-green-600'}`;
    toast.innerText = message.toUpperCase();
    
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ==================== 3. GESTIÓN DE USUARIO ====================
function updateUserDisplay() {
    if (!state.activeUser) return;
    
    const firstName = state.activeUser.name.split(' ')[0] || 'Usuario';
    const userId = state.activeUser.userId || state.activeUser.id || 'SIN-ID';
    
    // Desktop
    const nameDisplay = document.getElementById('user-display-name');
    const idDisplay = document.getElementById('user-display-id');
    
    if (nameDisplay) nameDisplay.textContent = firstName.toUpperCase();
    if (idDisplay) {
        const shortId = userId.length > 8 ? userId.substring(0, 8) + '...' : userId;
        idDisplay.textContent = `ID: ${shortId}`;
        idDisplay.title = `ID completo: ${userId}`;
    }
    
    // Móvil
    const mobileName = document.getElementById('user-mobile-name');
    const mobileId = document.getElementById('user-mobile-id');
    
    if (mobileName) mobileName.textContent = firstName.toUpperCase();
    if (mobileId) {
        const veryShortId = userId.length > 6 ? userId.substring(0, 4) + '...' : userId;
        mobileId.textContent = `ID: ${veryShortId}`;
        mobileId.title = `ID: ${userId}`;
    }
}

// ==================== 4. NAVEGACIÓN ====================
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.add('active');
    
    if (tabId === 'reports') loadDailyReport();
    else if (tabId === 'inventory') renderInventory(currentInventoryFilter);
    else if (tabId === 'pos') renderProducts();
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ==================== 5. AUTENTICACIÓN ====================
function checkAuth() {
    const loginScreen = document.getElementById('login-screen');
    const appInterface = document.getElementById('app-interface');
    
    if (pb.authStore.isValid) {
        if (loginScreen) loginScreen.style.display = 'none';
        if (appInterface) appInterface.style.display = 'block';
        initSystem();
    } else {
        if (loginScreen) loginScreen.style.display = 'flex';
        if (appInterface) appInterface.style.display = 'none';
    }
}

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-pass').value;
    const button = e.target.querySelector('button');
    
    if (!email || !password) {
        alert("Por favor ingrese email y contraseña");
        return;
    }
    
    try {
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="animate-pulse">VERIFICANDO...</span>';
        }
        
        await pb.collection('users').authWithPassword(email, password);
        checkAuth();
        
    } catch (error) {
        console.error("Login error:", error);
        alert("Credenciales incorrectas. Verifique su email y contraseña.");
        if (button) {
            button.disabled = false;
            button.innerText = "INICIAR SESIÓN";
        }
    }
});

// ==================== 6. INICIALIZACIÓN DEL SISTEMA ====================
async function initSystem() {
    console.log("%c 🚀 SISOV PRO v2.1: Inicializando sistema...", "background: #4f46e5; color: white; padding: 5px;");
    
    // ¡NO INICIAR EN 0! Primero verificar si hay tasa guardada
    const savedRate = parseFloat(sessionStorage.getItem('sisov_bcv_rate')) || 0;
    state.bcv_rate = savedRate;
    state.isCartLocked = (savedRate <= 0); // Solo bloqueado si no hay tasa
    
    // Cargar usuario
    if (pb.authStore.model) {
        state.activeUser = {
            id: pb.authStore.model.id,
            userId: pb.authStore.model.user_id || 'SIN-ID',
            name: pb.authStore.model.user_name || 'Usuario',
            role: pb.authStore.model.user_role || 'user',
            email: pb.authStore.model.email
        };
        updateRateUI(); // Ahora mostrará la tasa guardada o --.--
        updateRateSavedIndicator(); // ¡IMPORTANTE! Para mostrar el indicador
    }

     // Si hay tasa guardada, desbloquear el sistema
    if (savedRate > 0) {
        unlockSalesSystem();
    }
    
    // Cargar configuración y datos
    await loadBizSettings();
    await syncBcvRate();
    await fetchProducts();
    startTimeMonitor();
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
    console.log("%c ✅ Sistema inicializado correctamente", "color: #10b981; font-weight: bold;");
}

// ==================== 7. GESTIÓN DE TASA BCV ====================
async function syncBcvRate() {
    try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        const data = await response.json();
        
        if (data?.promedio) {
            state.api_official_rate = parseFloat(data.promedio);
            state.api_last_update = new Date().toLocaleString('es-VE', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
            updateTasaHint();
        }
    } catch (error) {
        console.warn("No se pudo obtener tasa BCV de API:", error);
        state.api_official_rate = 0;
    }
}

function saveRatePersistently(newRate) {
    if (!newRate || newRate <= 0) {
        console.error("Tasa inválida para guardar:", newRate);
        return;
    }
    
     // SOLO guardar en localStorage para la sesión actual
    // NO guardar para futuras sesiones
    sessionStorage.setItem('sisov_bcv_rate', newRate.toString());
    sessionStorage.setItem('sisov_bcv_rate_timestamp', new Date().toISOString());
    
    state.bcv_rate = newRate;
    state.isCartLocked = false;
    
    updateRateUI();
    unlockSalesSystem();
    updateRateSavedIndicator();
    
    console.log(`💾 Tasa guardada persistentemente: ${newRate.toFixed(2)} Bs`);
}

function updateRateSavedIndicator() {
    const savedRate = sessionStorage.getItem('sisov_bcv_rate'); // Cambia a sessionStorage
    const indicator = document.getElementById('rate-saved-indicator');
    const sourceIndicator = document.getElementById('rate-source-indicator');
    
    if (savedRate && indicator) {
        indicator.classList.remove('hidden');
        if (sourceIndicator) {
            const timestamp = sessionStorage.getItem('sisov_bcv_rate_timestamp'); // sessionStorage
            if (timestamp) {
                const date = new Date(timestamp);
                sourceIndicator.textContent = `BCV • ${date.toLocaleTimeString('es-VE', {hour: '2-digit', minute: '2-digit'})}`;
                sourceIndicator.title = `Guardada el ${date.toLocaleString('es-VE')}`;
            }
        }
    } else {
        // Si no hay tasa guardada, ocultar indicador
        if (indicator) indicator.classList.add('hidden');
        if (sourceIndicator) {
            sourceIndicator.textContent = 'BCV';
            sourceIndicator.title = 'Tasa no configurada';
        }
    }
}

function updateRateUI() {
    const rateDisplay = document.getElementById('rate-bcv');
    if (rateDisplay) {
        if (state.bcv_rate > 0) {
            rateDisplay.innerText = state.bcv_rate.toFixed(2);
        } else {
            rateDisplay.innerText = '--.--';
        }
    }
    
    if (state.bcv_rate > 0) {
        const alertDot = document.getElementById('rate-alert-dot');
        if (alertDot) alertDot.classList.add('hidden');
    }
}

function unlockSalesSystem() {
    state.isCartLocked = false;
    const productGrid = document.getElementById('product-grid');
    if (productGrid) productGrid.classList.remove('opacity-50', 'pointer-events-none');
    
    const alertDot = document.getElementById('rate-alert-dot');
    if (alertDot) alertDot.classList.add('hidden');
    
    console.log("✅ Sistema de ventas desbloqueado");
}

// ==================== 8. MODALES DE TASA ====================
/**
 * //id: LGI_TASA_FIX_FINAL_2026
 * //descripcion: Corrige el ReferenceError llamando al nombre correcto de la funcion de API.
 */
function openTasaModal() {
    const modal = document.getElementById('tasa-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        // CORRECCIÓN: Cambiamos fetchExchangeRate por fetchOfficialRate
        if (typeof fetchOfficialRate === 'function') {
            fetchOfficialRate(); 
        } else {
            console.log("%c RED API ERROR: fetchOfficialRate no encontrada ", "color: white; background: red;");
        }
        
        console.log("%c INFO: Modal de Tasa Abierto ", "color: white; background: blue; font-weight: bold;");
    }
}

// 2. Corregir el Cierre (Afecta a la X y al botón Volver)
function cerrarModalTasa() {
    const modal = document.getElementById('tasa-modal'); // ID Corregido
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

// 3. Unificar el Guardado Manual
async function saveManualTasa() {
    const input = document.getElementById('manual-tasa-input');
    const nuevaTasa = parseFloat(input.value);

    if (isNaN(nuevaTasa) || nuevaTasa <= 0) {
        showToast("Ingrese una tasa válida", 'error');
        console.log("%c UI WARNING: Tasa inválida introducida ", "color: orange; font-weight: bold;");
        return;
    }

    // Actualizar Estado Global
    state.bcv_rate = nuevaTasa;
    state.isCartLocked = false;

    // Persistir y Notificar
    localStorage.setItem('bcv_rate', nuevaTasa);
    updateRateUI();
    renderProducts(); // Recalcular precios en el POS
    
    cerrarModalTasa();
    
    showToast(`Tasa actualizada a ${nuevaTasa} Bs.`, 'success');
    console.log("%c SUCCESS: Tasa manual establecida correctamente ", "color: white; background: green; font-weight: bold;");
}

function updateTasaHint() {
    const hintSpan = document.getElementById('api-rate-hint');
    const dateSpan = document.getElementById('api-date-hint');
    
    if (hintSpan) {
        if (state.api_official_rate > 0) {
            hintSpan.innerText = state.api_official_rate.toFixed(2);
            hintSpan.dataset.value = state.api_official_rate;
            hintSpan.classList.remove('text-slate-400', 'opacity-50');
            hintSpan.classList.add('text-indigo-800', 'font-black');
        } else {
            hintSpan.innerText = '--.--';
            hintSpan.dataset.value = '0';
            hintSpan.classList.add('text-slate-400', 'opacity-50');
            hintSpan.classList.remove('text-indigo-800', 'font-black');
        }
    }

    if (dateSpan) {
        if (state.api_last_update) {
            dateSpan.innerText = `Actualizado: ${state.api_last_update}`;
            dateSpan.classList.remove('text-slate-400');
            dateSpan.classList.add('text-indigo-500', 'font-extrabold');
        } else {
            dateSpan.innerText = `⏳ Conectando con API BCV...`;
            dateSpan.classList.add('text-slate-400', 'italic');
        }
    }
}

function syncManualInputWithAPI() {
    const input = document.getElementById('manual-tasa-input');
    if (input && state.api_official_rate) {
        input.value = state.api_official_rate;
        saveRatePersistently(state.api_official_rate);
        showToast("Tasa sincronizada y guardada con API", 'success');
        
        setTimeout(() => {
            const modal = document.getElementById('tasa-modal');
            if (modal) modal.classList.replace('flex', 'hidden');
        }, 1000);
    }
}

function saveManualTasa() {
    const input = document.getElementById('manual-tasa-input');
    const newRate = parseFloat(input?.value) || 0;
    
    if (newRate <= 0) {
        showToast("Ingrese una tasa válida", 'error');
        return;
    }
    
    saveRatePersistently(newRate);
    
    const modal = document.getElementById('tasa-modal');
    if (modal) modal.classList.replace('flex', 'hidden');
    
    renderProducts();
    renderInventory(currentInventoryFilter);
    renderCart();
    
    showToast(`✅ Tasa guardada: ${newRate.toFixed(2)} Bs`, 'success');
}


function guardarNuevaTasa() {
    const input = document.getElementById('input-tasa-nueva');
    const newRate = parseFloat(input?.value) || 0;
    
    if (newRate <= 0) {
        showToast("Ingrese una tasa válida", 'error');
        return;
    }
    
    saveRatePersistently(newRate);
    cerrarModalTasa();
    renderProducts();
    renderInventory(currentInventoryFilter);
    renderCart();
    
    showToast(`✅ Tasa guardada: ${newRate.toFixed(2)} Bs`, 'success');
}


// ==================== 9. CONFIGURACIÓN DEL NEGOCIO ====================
async function loadBizSettings() {
    try {
        const settings = await pb.collection('settings').getFullList();
        const bizName = settings.find(s => s.key === 'biz_name')?.value;
        const bizRif = settings.find(s => s.key === 'biz_rif')?.value;
        
        if (bizName) state.biz.name = bizName;
        if (bizRif) state.biz.rif = bizRif;
        
        console.log(`Negocio: ${state.biz.name}`);
    } catch (error) {
        console.warn("No se pudo cargar configuración del negocio");
    }
}

// ==================== 10. GESTIÓN DE PRODUCTOS ====================
async function fetchProducts() {
    try {
        const records = await pb.collection('products').getFullList({
            sort: '-created',
            $autoCancel: false
        });
        
        state.products = records.map(record => ({
            id: record.id,
            produc_id: record.produc_id || record.product_id || '',
            name: record.product_name || 'Sin nombre',
            stock: parseInt(record.stock) || 0,
            price_usd: parseFloat(record.price_usd) || 0,
            price: parseFloat(record.price_usd) || 0,
            category: record.category || 'general'
        }));
        
        console.log(`✅ ${state.products.length} productos cargados`);
        renderProducts();
        renderInventory(currentInventoryFilter);
        return state.products;
    } catch (error) {
        console.error("Error al cargar productos:", error);
        showToast("Error al cargar productos", 'error');
        return [];
    }
}

/**
 * //id: LGI_RENDER_POS_FIX_2026
 * //descripcion: Corrige la visualización de Nombre y SKU en el punto de venta (POS).
 */
function renderProducts() {
    const grid = document.getElementById('product-grid');
    if (!grid) return;

    // Filtrado (manteniendo tu lógica actual)
    const filtered = state.products.filter(p => {
        const matchesSearch = p.name?.toLowerCase().includes((document.getElementById('search-pos')?.value || '').toLowerCase());
        const matchesCat = currentInventoryFilter === 'all' || p.category === currentInventoryFilter;
        return matchesSearch && matchesCat;
    });

    grid.innerHTML = filtered.map(product => {
        // VALIDACIÓN CRÍTICA DE DATOS
        const nombreParaMostrar = product.name || "PRODUCTO SIN NOMBRE";
        const skuParaMostrar = product.produc_id || "SIN SKU"; // Asegúrate que sea produc_id
        const precioVES = (product.price_usd * state.bcv_rate).toFixed(2);

        return `
        <div onclick="addToCart('${product.id}')" class="group bg-white p-4 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all cursor-pointer relative overflow-hidden">
            <div class="flex flex-col h-full">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-[8px] font-black px-2 py-1 bg-slate-100 rounded-lg text-slate-500 uppercase">${product.category || 'General'}</span>
                    <span class="text-[10px] font-bold ${product.stock > 0 ? 'text-green-500' : 'text-red-500'}">
                        ${product.stock} DISP.
                    </span>
                </div>
                <h3 class="font-bold text-slate-800 text-xs uppercase mb-1 leading-tight">${nombreParaMostrar}</h3>
                <p class="text-[9px] text-slate-400 font-mono mb-3">${skuParaMostrar}</p>
                
                <div class="mt-auto pt-3 border-t border-dashed">
                    <p class="text-indigo-600 font-black text-lg">$${parseFloat(product.price_usd).toFixed(2)}</p>
                    <p class="text-[10px] font-bold text-slate-400">${precioVES} Bs</p>
                </div>
            </div>
            
            <div class="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <i data-lucide="plus-circle" class="w-6 h-6 text-indigo-600"></i>
            </div>
        </div>`;
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ==================== 11. CARRITO DE COMPRAS ====================
function addToCart(productId) {
    if (state.isCartLocked) {
        showToast("Sistema bloqueado. Actualice la tasa BCV primero.", 'warning');
        return;
    }
    
    const product = state.products.find(p => p.id === productId);
    if (!product) {
        showToast("Producto no encontrado", 'error');
        return;
    }
    
    const availableStock = parseInt(product.stock) || 0;
    if (availableStock <= 0) {
        showToast(`Producto agotado: ${product.product_name}`, 'error');
        return;
    }
    
    const existingItem = state.cart.find(item => item.id === productId);
    
    if (existingItem) {
        if (existingItem.qty >= availableStock) {
            showToast(`Solo quedan ${availableStock} unidades disponibles`, 'warning');
            return;
        }
        existingItem.qty++;
    } else {
        state.cart.push({
            ...product,
            qty: 1,
            price: parseFloat(product.price_usd) || 0
        });
    }
    
    renderCart();
    showToast(`Agregado: ${product.product_name}`, 'success');
}

function removeFromCart(index) {
    if (index >= 0 && index < state.cart.length) {
        state.cart.splice(index, 1);
        renderCart();
    }
}

function renderCart() {
    const container = document.getElementById('cart-items');
    if (!container) return;
    
    if (state.cart.length === 0) {
        container.innerHTML = '<p class="text-center py-5 text-slate-300 text-xs italic">Carrito vacío</p>';
        document.getElementById('cart-total-ves').textContent = '0.00';
        return;
    }
    
    let totalUSD = 0;
    
    container.innerHTML = state.cart.map((item, index) => {
        const price = parseFloat(item.price) || 0;
        const quantity = parseInt(item.qty) || 0;
        const subtotal = price * quantity;
        totalUSD += subtotal;
        
        return `
            <div class="flex justify-between items-center bg-slate-50 p-3 rounded-2xl mb-2 border border-slate-100">
                <div class="flex flex-col">
                    <span class="text-[10px] font-black text-slate-700 uppercase">${item.name}</span>
                    <span class="text-[9px] text-slate-400">${quantity} x $${price.toFixed(2)}</span>
                </div>
                <div class="flex items-center gap-3">
                    <span class="font-bold text-xs text-indigo-600">$${subtotal.toFixed(2)}</span>
                    <button onclick="removeFromCart(${index})" class="text-red-400 hover:text-red-600 transition-colors">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    const totalVES = totalUSD * (state.bcv_rate || 0);
    document.getElementById('cart-total-ves').textContent = totalVES.toFixed(2);
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function cancelSale() {
    if (state.cart.length === 0) {
        showToast("El carrito ya está vacío", 'info');
        return;
    }
    
    if (confirm("¿Está seguro de vaciar el carrito?")) {
        state.cart = [];
        renderCart();
        showToast("Carrito vaciado", 'info');
    }
}

// ==================== 12. PROCESAMIENTO DE VENTAS ====================
async function processSale(paymentMethod) {
    if (state.isCartLocked) {
        showToast("Sistema bloqueado. Actualice la tasa BCV primero.", 'warning');
        return;
    }
    
    if (state.cart.length === 0) {
        showToast("El carrito está vacío", 'warning');
        return;
    }
    
    if (isProcessingSale) {
        showToast("Ya hay una venta en proceso", 'warning');
        return;
    }
    
    // Validar stock
    for (const item of state.cart) {
        const product = state.products.find(p => p.id === item.id);
        if (!product) {
            showToast(`Producto ${item.name} no encontrado`, 'error');
            return;
        }
        
        const availableStock = parseInt(product.stock) || 0;
        if (item.qty > availableStock) {
            showToast(`Stock insuficiente: ${item.name} (Solicitado: ${item.qty}, Disponible: ${availableStock})`, 'error');
            return;
        }
    }
    
    try {
        isProcessingSale = true;
        const button = document.getElementById('btn-cobrar');
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i data-lucide="loader" class="animate-spin w-5 h-5"></i> Procesando...';
        }
        
        // Calcular totales
        let totalUSD = 0;
        const saleItems = state.cart.map(item => {
            const price = parseFloat(item.price) || 0;
            const quantity = parseInt(item.qty) || 0;
            const subtotal = price * quantity;
            totalUSD += subtotal;
            
            return {
                id: item.id,
                name: item.name,
                sku: item.produc_id,
                price: price,
                qty: quantity,
                subtotal: subtotal
            };
        });
        
        const totalVES = totalUSD * (state.bcv_rate || 0);
        const invoiceNumber = `F-${Date.now().toString().slice(-6)}`;
        const dateId = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 17);
        
        // Datos de venta
        const saleData = {
            user_email: state.activeUser?.email || 'sistema@sisov.com',
            user_role: state.activeUser?.role || 'vendedor',
            n_factura: invoiceNumber,
            payment_method: paymentMethod || 'EFECTIVO',
            dolartoday: parseFloat(state.bcv_rate || 0),
            total_usd: parseFloat(totalUSD.toFixed(2)),
            total_ves: parseFloat(totalVES.toFixed(2)),
            items: JSON.stringify(saleItems),
            id_fecha: dateId
        };
        
        await pb.collection('sales').create(saleData);
        
        // Actualizar stock
        for (const item of state.cart) {
            const product = state.products.find(p => p.id === item.id);
            if (product) {
                const newStock = (parseInt(product.stock) || 0) - item.qty;
                await pb.collection('products').update(item.id, { stock: newStock });
            }
        }
        
        // Refrescar y limpiar
        await fetchProducts();
        state.cart = [];
        renderCart();
        
        showToast(`Venta procesada: ${invoiceNumber}`, 'success');
        generateTicketPDF(invoiceNumber, saleItems, totalVES, state.bcv_rate, new Date().toISOString(), paymentMethod);
        
    } catch (error) {
        console.error("Error al procesar venta:", error);
        let errorMessage = "Error al procesar la venta";
        if (error.data?.data) {
            const errors = Object.values(error.data.data).map(err => err.message).join(', ');
            errorMessage = `Errores: ${errors}`;
        }
        showToast(errorMessage, 'error');
        alert(`Error: ${error.message || 'Error desconocido'}`);
    } finally {
        isProcessingSale = false;
        const button = document.getElementById('btn-cobrar');
        if (button) {
            button.disabled = false;
            button.innerHTML = 'Cobrar';
        }
    }
}

// ==================== 13. INVENTARIO ====================
function renderInventory(filter = 'all') {
    currentInventoryFilter = filter;
    const tableBody = document.getElementById('inventory-table-body');
    if (!tableBody) return;
    
    let filteredProducts = [...state.products];
    
    switch(filter) {
        case 'low':
            filteredProducts = filteredProducts.filter(p => (parseInt(p.stock) || 0) > 0 && (parseInt(p.stock) || 0) <= 5);
            break;
        case 'out':
            filteredProducts = filteredProducts.filter(p => (parseInt(p.stock) || 0) <= 0);
            break;
    }
    
    // Búsqueda
    const searchInput = document.getElementById('inventory-search');
    if (searchInput && searchInput.value.trim() !== '') {
        const searchTerm = searchInput.value.trim().toUpperCase();
        filteredProducts = filteredProducts.filter(p => 
            (p.name && p.name.toUpperCase().includes(searchTerm)) ||
            (p.produc_id && p.produc_id.toUpperCase().includes(searchTerm))
        );
    }
    
    tableBody.innerHTML = filteredProducts.map(product => {
        const stock = parseInt(product.stock) || 0;
        const priceUSD = parseFloat(product.price_usd) || 0;
        const priceVES = priceUSD * state.bcv_rate;
        
        let stockClass = '', stockText = '';
        if (stock === 0) {
            stockClass = 'bg-red-100 text-red-700';
            stockText = `${stock}`;
        } else if (stock <= 5) {
            stockClass = 'bg-orange-100 text-orange-700';
            stockText = `${stock}`;
        } else {
            stockClass = 'bg-green-100 text-green-700';
            stockText = `${stock}`;
        }
        
        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="p-5">
                    <div class="flex flex-col">
                        <span class="font-bold text-slate-800 uppercase text-xs">${product.product_name}</span>
                        <span class="text-[9px] font-mono text-slate-400">${product.produc_id || 'SIN-CODIGO'}</span>
                    </div>
                </td>
                <td class="p-5 text-center">
                    <span class="px-3 py-1 rounded-full text-[10px] font-black ${stockClass}">${stockText}</span>
                </td>
                <td class="p-5 font-bold text-slate-700 text-sm">$${priceUSD.toFixed(2)}</td>
                <td class="p-5 font-black text-indigo-600 text-sm">${priceVES.toFixed(2)} Bs</td>
                <td class="p-5 text-right">
                    <div class="flex justify-end gap-2">
                        <button onclick="openEditPrice('${product.id}')" class="p-2 hover:bg-amber-50 text-amber-600 rounded-lg" title="Editar Precio">
                            <i data-lucide="tag" class="w-4 h-4"></i>
                        </button>
                        <button onclick="openRestockModal('${product.id}')" class="p-2 hover:bg-blue-50 text-blue-600 rounded-lg" title="Añadir Stock">
                            <i data-lucide="plus-circle" class="w-4 h-4"></i>
                        </button>
                        <button onclick="openReduceModal('${product.id}')" class="p-2 hover:bg-red-50 text-red-600 rounded-lg" title="Merma/Baja">
                            <i data-lucide="minus-circle" class="w-4 h-4"></i>
                        </button>
                        <!-- BOTÓN DE ELIMINAR - AÑADIDO -->
        <button onclick="deleteProduct('${product.id}')" 
                class="p-2 hover:bg-red-100 text-red-600 rounded-lg transition-colors duration-200"
                title="Eliminar Producto Permanentemente">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>

                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    if (filteredProducts.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="p-8 text-center">
                    <div class="flex flex-col items-center justify-center text-slate-400">
                        <i data-lucide="package" class="w-8 h-8 mb-2"></i>
                        <span class="text-xs italic">No hay productos en esta categoría</span>
                    </div>
                </td>
            </tr>
        `;
    }
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function filterInventory() {
    const term = document.getElementById('inventory-search').value.toUpperCase();
    const rows = document.querySelectorAll('#inventory-table-body tr');
    
    rows.forEach(row => {
        const text = row.innerText.toUpperCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

// ==================== 14. MODALES DE PRODUCTOS ====================
function openModal(productId = null) {
    console.log("🔵 Abriendo modal de producto, ID:", productId || 'nuevo');
    
    const modal = document.getElementById('product-modal');
    const form = document.getElementById('product-form');
    
    if (!modal) {
        console.error("❌ No se encontró el modal con id 'product-modal'");
        showToast("Error: No se puede abrir el formulario", 'error');
        return;
    }
    
    if (!form) {
        console.error("❌ No se encontró el formulario con id 'product-form'");
        return;
    }
    
    // Resetear formulario
    form.reset();
    
    // Si hay productId, es edición
    if (productId) {
        const product = state.products.find(p => p.id === productId);
        if (product) {
            // Setear valores en los inputs
            document.getElementById('p-name').value = product.product_name || '';
            document.getElementById('edit-product-id').value = product.produc_id || '';
            document.getElementById('p-category').value = product.category || 'general';
            document.getElementById('p-stock').value = product.stock || 0;
            document.getElementById('p-price').value = product.price_usd || 0;
            
            // Si estamos editando, almacenar el ID en el formulario
            form.dataset.editing = productId;
            
            console.log("📝 Editando producto:", product.product_name);
        }
    } else {
        // Es nuevo producto, valores por defecto
        document.getElementById('p-name').value = '';
        document.getElementById('edit-product-id').value = '';
        document.getElementById('p-category').value = 'general';
        document.getElementById('p-stock').value = 0;
        document.getElementById('p-price').value = 0;
        
        // Remover data attribute si existe
        delete form.dataset.editing;
        
        console.log("🆕 Creando nuevo producto");
    }
    
    // Actualizar precio en Bs si hay tasa configurada
    const priceVesContainer = document.getElementById('product-price-ves');
    const rateDisplay = document.getElementById('product-modal-rate');
    const vesAmount = document.getElementById('product-ves-amount');
    
    if (state.bcv_rate > 0 && priceVesContainer && rateDisplay && vesAmount) {
        priceVesContainer.classList.remove('hidden');
        rateDisplay.textContent = state.bcv_rate.toFixed(2);
        
        // Calcular precio inicial en Bs
        const priceInput = document.getElementById('p-price');
        if (priceInput) {
            const usdPrice = parseFloat(priceInput.value) || 0;
            const vesPrice = usdPrice * state.bcv_rate;
            vesAmount.textContent = `${vesPrice.toFixed(2)} Bs`;
            
            // Actualizar en tiempo real cuando cambie el precio
            priceInput.oninput = function() {
                const newUsdPrice = parseFloat(this.value) || 0;
                const newVesPrice = newUsdPrice * state.bcv_rate;
                vesAmount.textContent = `${newVesPrice.toFixed(2)} Bs`;
            };
        }
    } else if (priceVesContainer) {
        // Ocultar sección de precio en Bs si no hay tasa
        priceVesContainer.classList.add('hidden');
    }
    
    // Mostrar modal
    modal.classList.add('active');
    
    // Poner foco en el primer campo después de un breve delay
    setTimeout(() => {
        const firstInput = document.getElementById('p-name');
        if (firstInput) {
            firstInput.focus();
            firstInput.select();
        }
    }, 100);
    
    // Recargar íconos si es necesario
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    console.log("✅ Modal de producto abierto");
}

function closeModal() {
    console.log("🔵 Cerrando modal de producto");
    
    const modal = document.getElementById('product-modal');
    if (modal) {
        modal.classList.remove('active');
        
        // Limpiar el data attribute del formulario
        const form = document.getElementById('product-form');
        if (form) {
            delete form.dataset.editing;
        }
        
        console.log("✅ Modal de producto cerrado");
    }
}

function closeModal() {
    const modal = document.getElementById('product-modal');
    if (modal) modal.classList.remove('active');
}

// Asegúrate que este event listener esté presente y actualizado
document.getElementById('product-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    console.log("🔵 Enviando formulario de producto...");
    
    const productData = {
        name: document.getElementById('p-name').value.trim().toUpperCase(),
        produc_id: document.getElementById('edit-product-id').value.trim().toUpperCase(),
        category: document.getElementById('p-category').value || 'general',
        stock: parseInt(document.getElementById('p-stock').value) || 0,
        price_usd: parseFloat(document.getElementById('p-price').value) || 0
    };
    
    console.log("📦 Datos del producto:", productData);
    
    // Validaciones
    if (!productData.name || productData.name.length < 2) {
        showToast("El nombre debe tener al menos 2 caracteres", 'error');
        document.getElementById('p-name').focus();
        return;
    }
    
    if (!productData.produc_id || productData.produc_id.length < 3) {
        showToast("El código debe tener al menos 3 caracteres", 'error');
        document.getElementById('edit-product-id').focus();
        return;
    }
    
    if (productData.price_usd < 0) {
        showToast("El precio no puede ser negativo", 'error');
        document.getElementById('p-price').focus();
        return;
    }
    
    try {
        const form = document.getElementById('product-form');
        const isEditing = form.dataset.editing;
        
        if (isEditing) {
            // Verificar si el código está duplicado (excluyendo el producto actual)
            const existing = state.products.find(p => 
                p.produc_id === productData.produc_id && 
                p.id !== isEditing
            );
            
            if (existing) {
                showToast(`Ya existe otro producto con el código ${productData.produc_id}`, 'error');
                return;
            }
            
            // Actualizar producto existente
            await pb.collection('products').update(isEditing, productData);
            showToast("✅ Producto actualizado correctamente", 'success');
            console.log("✅ Producto actualizado:", productData.name);
        } else {
            // Verificar si el código está duplicado
            const existing = state.products.find(p => p.produc_id === productData.produc_id);
            
            if (existing) {
                showToast(`Ya existe un producto con el código ${productData.produc_id}`, 'error');
                return;
            }
            
            // Crear nuevo producto
            await pb.collection('products').create(productData);
            showToast("✅ Producto creado correctamente", 'success');
            console.log("✅ Producto creado:", productData.name);
        }
        
        // Actualizar productos y cerrar modal
        await fetchProducts();
        closeModal();
        
    } catch (error) {
        console.error("❌ Error al guardar producto:", error);
        
        let errorMessage = "Error al guardar producto";
        if (error.data?.data) {
            // Extraer mensajes de error de PocketBase
            const errors = Object.values(error.data.data).map(err => err.message).join(', ');
            errorMessage = `Errores: ${errors}`;
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        showToast(errorMessage, 'error');
    }
});
// ==================== 15. MODALES DE STOCK ====================
function openRestockModal(productId) {
    console.log("🔵 Abriendo modal de reabastecimiento para producto:", productId);
    
    const product = state.products.find(p => p.id === productId);
    if (!product) {
        showToast("Producto no encontrado", 'error');
        return;
    }
    
    currentRestockId = productId;
    
    // Actualizar información del producto en el modal
    const nameEl = document.getElementById('restock-product-name');
    const codeEl = document.getElementById('restock-product-code');
    const stockEl = document.getElementById('restock-current-stock');
    const newTotalEl = document.getElementById('restock-new-total');
    
    if (nameEl) nameEl.textContent = product.product_name;
    if (codeEl) codeEl.textContent = `Código: ${product.produc_id || 'N/A'}`;
    if (stockEl) stockEl.textContent = `Stock actual: ${product.stock || 0}`;
    
    // Resetear cantidad a 1
    const qtyInput = document.getElementById('restock-qty');
    if (qtyInput) {
        qtyInput.value = 1;
        qtyInput.min = 1;
        qtyInput.focus();
        qtyInput.select();
        
        // Actualizar preview cuando cambia
        qtyInput.oninput = function() {
            updateRestockPreview();
        };
    }
    
    // Actualizar preview inicial
    updateRestockPreview();
    
    // Mostrar modal
    const modal = document.getElementById('restock-modal');
    if (modal) {
        modal.classList.add('active');
        
        // Recargar íconos
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
    
    console.log("✅ Modal de reabastecimiento abierto");
}

function closeRestock() {
    console.log("🔵 Cerrando modal de reabastecimiento");
    
    const modal = document.getElementById('restock-modal');
    if (modal) {
        modal.classList.remove('active');
        currentRestockId = null;
        console.log("✅ Modal de reabastecimiento cerrado");
    }
}

function setRestockQty(quantity) {
    const qtyInput = document.getElementById('restock-qty');
    if (qtyInput) {
        qtyInput.value = quantity;
        updateRestockPreview();
        qtyInput.focus();
        qtyInput.select();
    }
}

function updateRestockPreview() {
    const qtyInput = document.getElementById('restock-qty');
    const product = state.products.find(p => p.id === currentRestockId);
    const newTotalEl = document.getElementById('restock-new-total');
    
    if (!qtyInput || !product || !newTotalEl) return;
    
    const currentStock = parseInt(product.stock) || 0;
    const addQty = parseInt(qtyInput.value) || 0;
    const newTotal = currentStock + addQty;
    
    newTotalEl.textContent = newTotal;
    
    // Cambiar color según cantidad
    if (addQty >= 100) {
        newTotalEl.className = 'text-lg font-black text-green-700';
    } else if (addQty >= 25) {
        newTotalEl.className = 'text-lg font-black text-blue-600';
    } else {
        newTotalEl.className = 'text-lg font-black text-slate-700';
    }
}

async function saveRestock() {
    console.log("🔵 Guardando reabastecimiento...");
    
    const quantity = parseInt(document.getElementById('restock-qty').value) || 0;
    
    if (quantity <= 0) {
        showToast("Ingrese una cantidad válida", 'warning');
        document.getElementById('restock-qty').focus();
        return;
    }
    
    if (!currentRestockId) {
        showToast("No hay producto seleccionado", 'error');
        return;
    }
    
    try {
        const product = await pb.collection('products').getOne(currentRestockId);
        const currentStock = parseInt(product.stock) || 0;
        const newStock = currentStock + quantity;
        
        // Actualizar en PocketBase
        await pb.collection('products').update(currentRestockId, { 
            stock: newStock 
        });
        
        // Actualizar estado local
        const localProduct = state.products.find(p => p.id === currentRestockId);
        if (localProduct) {
            localProduct.stock = newStock;
        }
        
        showToast(`✅ Stock actualizado: +${quantity} unidades`, 'success');
        console.log(`✅ Stock actualizado para producto ${currentRestockId}: +${quantity}`);
        
        // Cerrar modal y actualizar vistas
        closeRestock();
        
        // Actualizar todas las vistas
        renderProducts();
        renderInventory(currentInventoryFilter);
        
    } catch (error) {
        console.error("❌ Error al actualizar stock:", error);
        showToast("Error al actualizar stock", 'error');
    }
}

// ==================== 16. MODAL DE MERMA/REDUCCIÓN ====================
function openReduceModal(productId) {
    console.log("🔵 Abriendo modal de merma para producto:", productId);
    
    const product = state.products.find(p => p.id === productId);
    if (!product) {
        showToast("Producto no encontrado", 'error');
        return;
    }
    
    currentReduceId = productId;
    
    // Actualizar información del producto
    const nameEl = document.getElementById('reduce-name');
    const codeEl = document.getElementById('reduce-product-code');
    const stockEl = document.getElementById('reduce-current-stock');
    const newTotalEl = document.getElementById('reduce-new-total');
    
    if (nameEl) nameEl.textContent = product.product_name;
    if (codeEl) codeEl.textContent = `Código: ${product.produc_id || 'N/A'}`;
    if (stockEl) stockEl.textContent = `Stock actual: ${product.stock || 0}`;
    
    // Resetear cantidad a 1
    const qtyInput = document.getElementById('reduce-qty');
    if (qtyInput) {
        qtyInput.value = 1;
        qtyInput.max = product.stock || 0;
        qtyInput.min = 1;
        qtyInput.focus();
        qtyInput.select();
        
        // Actualizar preview cuando cambia
        qtyInput.oninput = function() {
            updateReducePreview();
        };
    }
    
    // Actualizar preview inicial
    updateReducePreview();
    
    // Mostrar modal
    const modal = document.getElementById('reduce-modal');
    if (modal) {
        modal.classList.add('active');
        
        // Recargar íconos
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
    
    console.log("✅ Modal de merma abierto");
}

function closeReduceStock() {
    console.log("🔵 Cerrando modal de merma");
    
    const modal = document.getElementById('reduce-modal');
    if (modal) {
        modal.classList.remove('active');
        currentReduceId = null;
        console.log("✅ Modal de merma cerrado");
    }
}

function setReduceQty(quantity) {
    const qtyInput = document.getElementById('reduce-qty');
    if (qtyInput) {
        qtyInput.value = quantity;
        updateReducePreview();
        qtyInput.focus();
        qtyInput.select();
    }
}

function updateReducePreview() {
    const qtyInput = document.getElementById('reduce-qty');
    const product = state.products.find(p => p.id === currentReduceId);
    const newTotalEl = document.getElementById('reduce-new-total');
    const warningEl = document.getElementById('reduce-warning');
    
    if (!qtyInput || !product || !newTotalEl) return;
    
    const currentStock = parseInt(product.stock) || 0;
    const reduceQty = parseInt(qtyInput.value) || 0;
    const newTotal = currentStock - reduceQty;
    
    newTotalEl.textContent = newTotal;
    
    // Mostrar advertencia si se queda bajo o negativo
    if (warningEl) {
        if (newTotal < 0) {
            warningEl.textContent = "⚠️ El stock quedará NEGATIVO";
            warningEl.className = "text-xs font-bold text-red-600 mt-1";
            newTotalEl.className = 'text-lg font-black text-red-600';
        } else if (newTotal <= 5) {
            warningEl.textContent = "⚠️ Stock quedará BAJO";
            warningEl.className = "text-xs font-bold text-amber-600 mt-1";
            newTotalEl.className = 'text-lg font-black text-amber-600';
        } else {
            warningEl.textContent = "";
            newTotalEl.className = 'text-lg font-black text-slate-700';
        }
    }
}

// Función opcional para registrar mermas en un log
async function saveReduceStock() {
    console.log("🔵 Guardando merma...");
    
    const quantity = parseInt(document.getElementById('reduce-qty').value) || 0;
    
    if (quantity <= 0) {
        showToast("Ingrese una cantidad válida", 'warning');
        document.getElementById('reduce-qty').focus();
        return;
    }
    
    if (!currentReduceId) {
        showToast("No hay producto seleccionado", 'error');
        return;
    }
    
    try {
        const product = await pb.collection('products').getOne(currentReduceId);
        const currentStock = parseInt(product.stock) || 0;
        
        // Validar que no se reste más del disponible
        if (quantity > currentStock) {
            showToast(`No puede restar más del stock disponible (${currentStock} unidades)`, 'error');
            return;
        }
        
        const newStock = currentStock - quantity;
        
        // Confirmación extra si queda poco stock
        if (newStock <= 5) {
            if (!confirm(`⚠️ ATENCIÓN\n\nEl producto quedará con ${newStock} unidades.\n¿Continuar con la merma?`)) {
                return;
            }
        }
        
        // Actualizar en PocketBase
        await pb.collection('products').update(currentReduceId, { 
            stock: newStock 
        });
        
        // Actualizar estado local
        const localProduct = state.products.find(p => p.id === currentReduceId);
        if (localProduct) {
            localProduct.stock = newStock;
        }
        
        // Intentar registrar la merma en log (opcional - no bloqueante)
        try {
            await logMerma(currentReduceId, product.product_name, quantity, currentStock, newStock);
        } catch (logError) {
            // Ignorar errores del log, no son críticos
            console.log("ℹ️ Log de merma opcional, continuando...");
        }
        
        showToast(`✅ Merma registrada: -${quantity} unidades`, 'success');
        console.log(`✅ Merma registrada para producto ${currentReduceId}: -${quantity}`);
        
        // Cerrar modal y actualizar vistas
        closeReduceStock();
        
        // Actualizar todas las vistas
        renderProducts();
        renderInventory(currentInventoryFilter);
        
    } catch (error) {
        console.error("❌ Error al registrar merma:", error);
        
        let errorMessage = "Error al registrar merma";
        if (error.status === 404) {
            errorMessage = "Producto no encontrado";
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        showToast(errorMessage, 'error');
    }
}


// Función opcional para registrar mermas - MODIFICADA
async function logMerma(productId, productName, quantity, oldStock, newStock) {
    try {
        // Intentar registrar en PocketBase
        await pb.collection('mermas_log').create({
            product_id: productId,
            product_name: productName,
            quantity: quantity,
            old_stock: oldStock,
            new_stock: newStock,
            user: state.activeUser?.email || 'sistema',
            date: new Date().toISOString()
        });
        console.log("📝 Merma registrada en log");
    } catch (error) {
        // Si la colección no existe, solo mostrar warning en consola
        if (error.status === 404) {
            console.warn("ℹ️ Colección 'mermas_log' no existe. Merma registrada localmente.");
            
            // Opcional: Guardar en localStorage como backup
            try {
                const mermaLog = JSON.parse(localStorage.getItem('sisov_mermas_log') || '[]');
                mermaLog.push({
                    product_id: productId,
                    product_name: productName,
                    quantity: quantity,
                    old_stock: oldStock,
                    new_stock: newStock,
                    user: state.activeUser?.email || 'sistema',
                    date: new Date().toISOString(),
                    timestamp: Date.now()
                });
                
                // Guardar solo las últimas 100 mermas
                if (mermaLog.length > 100) {
                    mermaLog.splice(0, mermaLog.length - 100);
                }
                
                localStorage.setItem('sisov_mermas_log', JSON.stringify(mermaLog));
                console.log("📝 Merma guardada en localStorage");
            } catch (localError) {
                console.warn("No se pudo guardar merma localmente:", localError);
            }
        } else {
            console.warn("Error al registrar merma en log:", error);
        }
    }
}
// ==================== 16. EDICIÓN DE PRECIO ====================

function openEditPrice(productId) {
    console.log("🔵 Abriendo modal de edición de precio para:", productId);
    
    const product = state.products.find(p => p.id === productId);
    if (!product) {
        showToast("Producto no encontrado", 'error');
        return;
    }
    
    currentPriceEditId = productId;
    
    // Actualizar información del producto
    const nameEl = document.getElementById('price-product-name');
    const stockEl = document.getElementById('price-current-stock');
    const categoryEl = document.getElementById('price-category');
    const codeInput = document.getElementById('new-product-id');
    const priceInput = document.getElementById('new-price-usd');
    const rateEl = document.getElementById('modal-current-rate');
    
    if (nameEl) nameEl.textContent = product.product_name;
    if (stockEl) stockEl.textContent = product.stock || 0;
    if (categoryEl) categoryEl.textContent = product.category || 'general';
    if (codeInput) {
        codeInput.value = product.produc_id || '';
        codeInput.placeholder = 'Ej: PROD-001';
    }
    if (priceInput) {
        priceInput.value = product.price_usd || 0;
    }
    if (rateEl) {
        rateEl.textContent = state.bcv_rate.toFixed(2);
    }
    
    // Actualizar precio en bolívares
    updateLivePriceVES();
    
    // Mostrar modal
    const modal = document.getElementById('price-modal');
    if (modal) {
        modal.classList.add('active');
        
        // Poner foco en el precio después de un breve delay
        setTimeout(() => {
            if (priceInput) {
                priceInput.focus();
                priceInput.select();
            }
        }, 100);
        
        // Recargar íconos
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
    
    console.log("✅ Modal de edición de precio abierto");
}

function closePriceModal() {
    console.log("🔵 Cerrando modal de edición de precio");
    
    const modal = document.getElementById('price-modal');
    if (modal) {
        modal.classList.remove('active');
        currentPriceEditId = null;
        console.log("✅ Modal de edición de precio cerrado");
    }
}


//__________________________________________________________________

function updateLivePriceVES() {
    console.log("🔄 Actualizando precio en bolívares...");
    
    const usdInput = document.getElementById('new-price-usd');
    const livePriceEl = document.getElementById('live-price-ves');
    
    if (!usdInput || !livePriceEl) return;
    
    const usd = parseFloat(usdInput.value) || 0;
    const rate = state.bcv_rate || 0;
    const ves = usd * rate;
    
    // Actualizar texto
    livePriceEl.textContent = ves.toFixed(2);
    
    // Añadir clase de animación
    livePriceEl.classList.add('updated');
    setTimeout(() => {
        livePriceEl.classList.remove('updated');
    }, 300);
    
    // Cambiar color según el precio
    if (usd === 0) {
        livePriceEl.className = 'text-2xl font-black text-slate-400 updated';
    } else if (ves > 100000) {
        livePriceEl.className = 'text-2xl font-black text-red-600 updated';
    } else if (ves > 10000) {
        livePriceEl.className = 'text-2xl font-black text-amber-600 updated';
    } else {
        livePriceEl.className = 'text-2xl font-black text-indigo-700 updated';
    }
}

async function saveNewPrice() {
    console.log("🔵 Guardando cambios de precio...");
    
    const productIdEl = document.getElementById('new-product-id');
    const priceInputEl = document.getElementById('new-price-usd');
    
    if (!productIdEl || !priceInputEl || !currentPriceEditId) {
        showToast("Datos incompletos", 'error');
        return;
    }
    
    const newPrice = parseFloat(priceInputEl.value) || 0;
    const newCode = productIdEl.value.trim().toUpperCase();
    
    // Validaciones
    if (newPrice < 0) {
        showToast("El precio no puede ser negativo", 'error');
        priceInputEl.focus();
        return;
    }
    
    if (newPrice === 0) {
        if (!confirm("⚠️ El precio es $0.00\n¿Está seguro de continuar?")) {
            return;
        }
    }
    
    if (!newCode) {
        showToast("El código de producto es requerido", 'error');
        productIdEl.focus();
        return;
    }
    
    if (newCode.length < 3) {
        showToast("El código debe tener al menos 3 caracteres", 'error');
        productIdEl.focus();
        return;
    }
    
    try {
        // Verificar si el código ya existe en otro producto
        const existingProduct = state.products.find(p => 
            p.produc_id === newCode && 
            p.id !== currentPriceEditId
        );
        
        if (existingProduct) {
            showToast(`El código "${newCode}" ya está en uso por "${existingProduct.product_name}"`, 'error');
            return;
        }
        
        // Obtener producto actual para registro
        const currentProduct = state.products.find(p => p.id === currentPriceEditId);
        
        // Preparar datos de actualización
        const updateData = {
            price_usd: newPrice,
            produc_id: newCode
        };
        
        // Actualizar en PocketBase
        await pb.collection('products').update(currentPriceEditId, updateData);
        
        // Actualizar estado local
        if (currentProduct) {
            currentProduct.price_usd = newPrice;
            currentProduct.produc_id = newCode;
        }
        
        showToast("✅ Producto actualizado correctamente", 'success');
        console.log(`✅ Producto ${currentPriceEditId} actualizado: $${newPrice}, código: ${newCode}`);
        
        // Cerrar modal
        closePriceModal();
        
        // Actualizar todas las vistas
        renderProducts();
        renderInventory(currentInventoryFilter);
        
        // Si el producto está en el carrito, actualizarlo
        const cartItem = state.cart.find(item => item.id === currentPriceEditId);
        if (cartItem) {
            cartItem.price = newPrice;
            cartItem.produc_id = newCode;
            renderCart();
        }
        
    } catch (error) {
        console.error("❌ Error al actualizar producto:", error);
        
        let errorMessage = "Error al actualizar producto";
        if (error.data?.data) {
            const errors = Object.values(error.data.data).map(err => err.message).join(', ');
            errorMessage = `Errores: ${errors}`;
        } else if (error.message) {
            errorMessage = error.message;
        }
        
        showToast(errorMessage, 'error');
    }
}


// ==================== 17. REPORTES ====================
async function loadDailyReport() {
    try {
        const dateInput = document.getElementById('report-date');
        const targetDate = dateInput?.value || new Date().toISOString().split('T')[0];
        
        const filter = `created >= "${targetDate} 00:00:00" && created <= "${targetDate} 23:59:59"`;
        const sales = await pb.collection('sales').getFullList({ filter, sort: '-created' });
        
        renderDailySalesTable(sales);
        calculateAndDisplayTotals(sales);
        
    } catch (error) {
        console.error("Error al cargar reporte:", error);
        showToast("Error al cargar reporte", 'error');
    }
}

function renderDailySalesTable(sales) {
    const tableBody = document.getElementById('daily-sales-table');
    if (!tableBody) return;
    
    if (!sales || sales.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="p-10 text-center text-slate-400 italic">No hay ventas registradas en esta fecha</td>
            </tr>
        `;
        return;
    }
    
    tableBody.innerHTML = sales.map(sale => {
        let itemsCount = 0;
        let itemsText = '';
        
        try {
            if (sale.items) {
                const items = typeof sale.items === 'string' ? JSON.parse(sale.items) : sale.items;
                itemsCount = Array.isArray(items) ? items.length : 0;
                if (Array.isArray(items)) {
                    itemsText = items.map(item => `${item.qty}x ${item.name}`).join(', ');
                }
            }
        } catch (e) {
            itemsCount = 0;
            itemsText = 'Error al cargar items';
        }
        
        const saleTime = new Date(sale.created).toLocaleTimeString('es-VE', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        return `
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td class="p-5">
                    <div class="flex flex-col">
                        <span class="text-[10px] font-black text-indigo-600 uppercase">${sale.n_factura || 'SIN-FACTURA'}</span>
                        <span class="text-[9px] text-slate-400 font-mono">${sale.user_email || ''}</span>
                    </div>
                </td>
                <td class="p-5 text-[10px] font-mono text-slate-500">${saleTime}</td>
                <td class="p-5 text-[9px] leading-tight text-slate-600">${itemsText.substring(0, 50)}${itemsText.length > 50 ? '...' : ''}</td>
                <td class="p-5 font-mono text-xs">$${(sale.total_usd || 0).toFixed(2)}</td>
                <td class="p-5 text-right">
                    <button onclick="viewSaleDetails('${sale.id}')" class="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold uppercase transition-colors">
                        Detalle
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function calculateAndDisplayTotals(sales) {
    if (!sales || sales.length === 0) {
        document.getElementById('total-day-usd').textContent = '$0.00';
        document.getElementById('total-day-ves').textContent = '0.00 Bs';
        document.getElementById('total-transactions').textContent = '0';
        return;
    }
    
    const totalUSD = sales.reduce((sum, sale) => sum + (parseFloat(sale.total_usd) || 0), 0);
    const totalVES = sales.reduce((sum, sale) => sum + (parseFloat(sale.total_ves) || 0), 0);
    const transactionCount = sales.length;
    
    document.getElementById('total-day-usd').textContent = `$${totalUSD.toFixed(2)}`;
    document.getElementById('total-day-ves').textContent = `${totalVES.toFixed(2)} Bs`;
    document.getElementById('total-transactions').textContent = transactionCount.toString();
}

function filterReports() {
    const term = document.getElementById('report-search').value.toUpperCase();
    const rows = document.querySelectorAll('#daily-sales-table tr');
    
    rows.forEach(row => {
        const text = row.innerText.toUpperCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

//funcion para generar reportes simple PDF
async function generateSimplePDF() {
    try {
        const dateInput = document.getElementById('report-date');
        const targetDate = dateInput?.value || new Date().toISOString().split('T')[0];
        
        const filter = `created >= "${targetDate} 00:00:00" && created <= "${targetDate} 23:59:59"`;
        const sales = await pb.collection('sales').getFullList({ filter, sort: '-created' });
        
        if (sales.length === 0) {
            showToast("No hay ventas para generar reporte", 'warning');
            return;
        }
        
        // Calcular totales
        const totalUSD = sales.reduce((sum, sale) => sum + (parseFloat(sale.total_usd) || 0), 0);
        const totalVES = sales.reduce((sum, sale) => sum + (parseFloat(sale.total_ves) || 0), 0);
        const totalTransactions = sales.length;
        
        // Métodos de pago
        const paymentMethods = {
            EFECTIVO: 0,
            'PAGO MOVIL': 0,
            DIVISAS: 0,
            MIXTO: 0
        };
        
        sales.forEach(sale => {
            const method = sale.payment_method || 'EFECTIVO';
            if (paymentMethods[method] !== undefined) {
                paymentMethods[method] += parseFloat(sale.total_usd) || 0;
            }
        });
        
        // Crear PDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // ========== ENCABEZADO ==========
        doc.setFontSize(16).setFont(undefined, 'bold');
        doc.text("CIERRE DE CAJA DIARIO", 105, 20, { align: 'center' });
        
        doc.setFontSize(10).setFont(undefined, 'normal');
        doc.text(`${state.biz.name} | RIF: ${state.biz.rif}`, 105, 28, { align: 'center' });
        doc.text(`Fecha: ${targetDate}`, 105, 34, { align: 'center' });
        doc.text(`Usuario: ${state.activeUser?.name || 'Sistema'}`, 105, 40, { align: 'center' });
        
        doc.line(10, 45, 200, 45);
        
        // ========== RESUMEN GENERAL ==========
        let y = 55;
        doc.setFontSize(12).setFont(undefined, 'bold');
        doc.text("RESUMEN DEL DÍA", 10, y);
        
        y += 10;
        doc.setFontSize(10).setFont(undefined, 'normal');
        doc.text(`Total Ventas en USD:`, 20, y);
        doc.text(`$${totalUSD.toFixed(2)}`, 160, y, { align: 'right' });
        
        y += 7;
        doc.text(`Total Ventas en Bs:`, 20, y);
        doc.text(`${totalVES.toFixed(2)} Bs`, 160, y, { align: 'right' });
        
        y += 7;
        doc.text(`Tasa BCV del día:`, 20, y);
        doc.text(`${state.bcv_rate.toFixed(2)} Bs/$`, 160, y, { align: 'right' });
        
        y += 7;
        doc.text(`Número de Transacciones:`, 20, y);
        doc.text(`${totalTransactions}`, 160, y, { align: 'right' });
        
        y += 15;
        doc.setFontSize(12).setFont(undefined, 'bold');
        doc.text("MÉTODOS DE PAGO (USD)", 10, y);
        
        y += 10;
        doc.setFontSize(10);
        Object.entries(paymentMethods).forEach(([method, amount]) => {
            if (amount > 0) {
                doc.text(`${method}:`, 20, y);
                doc.text(`$${amount.toFixed(2)}`, 160, y, { align: 'right' });
                y += 7;
            }
        });
        
        // ========== DETALLE DE VENTAS ==========
        y += 10;
        doc.setFontSize(12).setFont(undefined, 'bold');
        doc.text("DETALLE DE VENTAS", 10, y);
        
        y += 10;
        doc.setFontSize(9);
        sales.forEach((sale, index) => {
            if (y > 250) { // Si se llena la página
                doc.addPage();
                y = 20;
            }
            
            const saleTime = new Date(sale.created).toLocaleTimeString('es-VE', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            doc.text(`${index + 1}. ${sale.n_factura || 'S/F'} - ${saleTime}`, 15, y);
            doc.text(`${sale.payment_method || 'EFECTIVO'}`, 80, y);
            doc.text(`$${(sale.total_usd || 0).toFixed(2)}`, 130, y);
            doc.text(`${(sale.total_ves || 0).toFixed(2)} Bs`, 180, y, { align: 'right' });
            
            y += 6;
            
            // Items de la venta (abreviado)
            try {
                const items = typeof sale.items === 'string' ? JSON.parse(sale.items) : sale.items;
                if (Array.isArray(items) && items.length > 0) {
                    const itemsText = items.map(item => `${item.qty}x ${item.name.substring(0, 20)}`).join(', ');
                    doc.setFontSize(8).setFont(undefined, 'italic');
                    doc.text(`   ${itemsText}`, 15, y);
                    doc.setFontSize(9).setFont(undefined, 'normal');
                    y += 5;
                }
            } catch (e) {
                // Ignorar error en items
            }
            
            y += 4;
        });
        
        // ========== FIRMA ==========
        y += 15;
        doc.line(50, y, 100, y);
        doc.text("Firma del Responsable", 75, y + 5, { align: 'center' });
        
        // ========== GUARDAR ==========
        const fileName = `Cierre_Caja_${targetDate}.pdf`;
        doc.save(fileName);
        
        showToast(`✅ Reporte PDF generado: ${fileName}`, 'success');
        
    } catch (error) {
        console.error("Error al generar reporte PDF:", error);
        showToast("Error al generar reporte PDF", 'error');
    }
}

//📊 PDF DETALLADO (Corregido):=======================================
async function generateDetailedPDF() {
    try {
        const dateInput = document.getElementById('report-date');
        const targetDate = dateInput?.value || new Date().toISOString().split('T')[0];
        
        const filter = `created >= "${targetDate} 00:00:00" && created <= "${targetDate} 23:59:59"`;
        const sales = await pb.collection('sales').getFullList({ filter, sort: '-created' });
        
        if (sales.length === 0) {
            showToast("No hay ventas para generar reporte", 'warning');
            return;
        }
        
        // Calcular totales
        const totalUSD = sales.reduce((sum, sale) => sum + (parseFloat(sale.total_usd) || 0), 0);
        const totalVES = sales.reduce((sum, sale) => sum + (parseFloat(sale.total_ves) || 0), 0);
        const totalTransactions = sales.length;
        
        // Métodos de pago
        const paymentMethods = {
            EFECTIVO: { monto: 0 },
            'PAGO MOVIL': { monto: 0 },
            DIVISAS: { monto: 0 },
            MIXTO: { monto: 0 }
        };
        
        sales.forEach(sale => {
            const method = sale.payment_method || 'EFECTIVO';
            if (paymentMethods[method]) {
                paymentMethods[method].monto += parseFloat(sale.total_usd) || 0;
            }
        });
        
        // ========== CREAR PDF OPTIMIZADO ==========
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // ========== ENCABEZADO MINIMALISTA ==========
        // Sin fondo para ahorrar tinta
        doc.setTextColor(30, 58, 138); // Azul oscuro suave
        doc.setFontSize(16).setFont(undefined, 'bold');
        doc.text("REPORTE DE CIERRE DIARIO", 105, 15, { align: 'center' });
        
        // Información esencial
        doc.setFontSize(9).setFont(undefined, 'normal');
        doc.text(`${state.biz.name}`, 105, 22, { align: 'center' });
        doc.text(`Fecha: ${targetDate}`, 105, 28, { align: 'center' });
        doc.text(`Responsable: ${state.activeUser?.name || 'Sistema'}`, 105, 34, { align: 'center' });
        
        // Línea sutil
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.line(10, 40, 200, 40);
        
        // ========== RESÚMENES RÁPIDOS ==========
        let y = 50;
        
        // Métodos de pago (sin colores, solo texto)
        doc.setFontSize(11).setFont(undefined, 'bold');
        doc.text("MÉTODOS DE PAGO", 10, y);
        
        y += 8;
        doc.setFontSize(9).setFont(undefined, 'normal');
        
        Object.entries(paymentMethods).forEach(([method, data]) => {
            if (data.monto > 0) {
                doc.text(`${method}:`, 15, y);
                doc.text(`$${data.monto.toFixed(2)}`, 180, y, { align: 'right' });
                y += 6;
            }
        });
        
        y += 8;
        
        // ========== DETALLE DE VENTAS (TABLA LIGERA) ==========
        doc.setFontSize(11).setFont(undefined, 'bold');
        doc.text("DETALLE DE VENTAS", 10, y);
        
        y += 8;
        
        // Encabezado de tabla minimalista (sin fondo)
        const headers = ["#", "HORA", "MÉTODO", "FACTURA", "USD", "Bs"];
        const positions = [10, 30, 60, 100, 140, 170];
        
        doc.setFontSize(8).setFont(undefined, 'bold');
        headers.forEach((header, i) => {
            doc.text(header, positions[i], y, i >= 4 ? { align: 'right' } : {});
        });
        
        y += 5;
        doc.setDrawColor(203, 213, 225);
        doc.line(10, y, 200, y);
        y += 3;
        
        // Filas de ventas (alternancia sutil)
        doc.setFontSize(8).setFont(undefined, 'normal');
        sales.forEach((sale, index) => {
            if (y > 250) { // Nueva página si es necesario
                doc.addPage();
                y = 20;
                
                // Re-dibujar encabezado de tabla
                doc.setFontSize(8).setFont(undefined, 'bold');
                headers.forEach((header, i) => {
                    doc.text(header, positions[i], y, i >= 4 ? { align: 'right' } : {});
                });
                y += 5;
                doc.line(10, y, 200, y);
                y += 3;
                doc.setFontSize(8).setFont(undefined, 'normal');
            }
            
            // Fila alternada muy sutil (gris muy claro)
            if (index % 2 === 0) {
                doc.setFillColor(250, 250, 250); // Gris casi blanco
                doc.rect(10, y - 2, 190, 6, 'F');
            }
            
            const saleTime = new Date(sale.created).toLocaleTimeString('es-VE', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            // Datos de la fila
            const rowData = [
                (index + 1).toString(),
                saleTime,
                sale.payment_method || 'EFECTIVO',
                sale.n_factura || 'S/N',
                `$${(sale.total_usd || 0).toFixed(2)}`,
                `${(sale.total_ves || 0).toFixed(2)}`
            ];
            
            rowData.forEach((data, i) => {
                doc.setTextColor(15, 23, 42); // Gris oscuro para mejor legibilidad
                doc.text(data, positions[i], y + 2, i >= 4 ? { align: 'right' } : {});
            });
            
            y += 6;
        });
        
        // ========== TOTALES DESTACADOS (AL FINAL) ==========
        const pageHeight = doc.internal.pageSize.height;
        let totalsY = pageHeight - 60;
        
        // Si estamos muy abajo, nueva página para los totales
        if (y > totalsY - 20) {
            doc.addPage();
            totalsY = 20;
        }
        
        // Línea separadora antes de totales
        doc.setDrawColor(30, 58, 138); // Azul suave
        doc.setLineWidth(0.5);
        doc.line(10, totalsY, 200, totalsY);
        totalsY += 10;
        
        // TOTALS BOX - Diseño limpio pero destacado
        doc.setFillColor(249, 250, 251); // Gris muy claro
        doc.roundedRect(10, totalsY, 190, 40, 2, 2, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(10, totalsY, 190, 40, 2, 2);
        
        // Título de totales
        doc.setTextColor(30, 58, 138);
        doc.setFontSize(12).setFont(undefined, 'bold');
        doc.text("RESUMEN FINAL", 105, totalsY + 8, { align: 'center' });
        
        // Total USD (dólares) - Izquierda
        doc.setFontSize(11);
        doc.text("TOTAL EN DÓLARES:", 20, totalsY + 20);
        doc.setFontSize(14).setFont(undefined, 'bold');
        doc.setTextColor(22, 101, 52); // Verde oscuro suave
        doc.text(`$${totalUSD.toFixed(2)}`, 90, totalsY + 20);
        
        // Total Bs (bolívares) - Derecha
        doc.setFontSize(11).setFont(undefined, 'normal');
        doc.setTextColor(30, 58, 138);
        doc.text("TOTAL EN BOLÍVARES:", 120, totalsY + 20);
        doc.setFontSize(14).setFont(undefined, 'bold');
        doc.setTextColor(79, 70, 229); // Índigo suave
        doc.text(`${totalVES.toFixed(2)} Bs`, 180, totalsY + 20, { align: 'right' });
        
        // Información adicional debajo
        doc.setFontSize(9).setFont(undefined, 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Tasa BCV: ${state.bcv_rate.toFixed(2)} Bs/$ | Transacciones: ${totalTransactions}`, 105, totalsY + 32, { align: 'center' });
        
        // ========== FIRMA (OPTIMIZADA) ==========
        totalsY += 50;
        
        // Línea para firma
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.line(50, totalsY, 160, totalsY);
        
        // Texto de firma minimalista
        doc.setFontSize(8);
        doc.text("_________________________________________", 105, totalsY + 5, { align: 'center' });
        doc.text("Firma del Responsable", 105, totalsY + 12, { align: 'center' });
        
        // Información de sistema en pie de página
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(`SISOV PRO v2.1 | ${new Date().toLocaleDateString('es-VE')} ${new Date().toLocaleTimeString('es-VE', {hour: '2-digit', minute: '2-digit'})}`, 105, pageHeight - 10, { align: 'center' });
        
        // ========== GUARDAR PDF ==========
        const fileName = `Cierre_${targetDate}.pdf`;
        doc.save(fileName);
        
        showToast(`✅ Reporte PDF generado: ${fileName}`, 'success');
        
    } catch (error) {
        console.error("Error al generar reporte PDF:", error);
        showToast("Error al generar reporte PDF", 'error');
    }
}

//=====================================================================
function exportReportToJSON(reportData, date) {
    try {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(reportData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `cierre_${date}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        
        showToast("Reporte exportado", 'success');
    } catch (error) {
        console.error("Error al exportar reporte:", error);
        showToast("Error al exportar reporte", 'error');
    }
}

async function viewSaleDetails(saleId) {
    try {
        const sale = await pb.collection('sales').getOne(saleId);
        
        let itemsHtml = '';
        try {
            const items = typeof sale.items === 'string' ? JSON.parse(sale.items) : sale.items;
            if (Array.isArray(items)) {
                itemsHtml = items.map(item => `
                    <div class="flex justify-between py-2 border-b border-slate-100 last:border-0">
                        <div class="flex-1">
                            <span class="text-xs font-bold text-slate-700">${item.name || 'Producto'}</span>
                            <div class="text-[10px] text-slate-400">
                                ${item.sku || ''} | ${item.qty || 0} x $${(item.price || 0).toFixed(2)}
                            </div>
                        </div>
                        <span class="text-xs font-bold text-indigo-600">$${(item.qty * item.price || 0).toFixed(2)}</span>
                    </div>
                `).join('');
            }
        } catch (e) {
            itemsHtml = '<div class="text-slate-400 italic text-xs">No se pudieron cargar los items</div>';
        }
        
        const modalHtml = `
            <div class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                    <div class="p-6 border-b">
                        <div class="flex justify-between items-center">
                            <h3 class="text-lg font-bold text-slate-800">Detalle de Venta</h3>
                            <button onclick="this.closest('.fixed').remove()" class="text-slate-400 hover:text-slate-600">
                                <i data-lucide="x" class="w-5 h-5"></i>
                            </button>
                        </div>
                        <div class="mt-2">
                            <span class="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">${sale.n_factura || 'SIN-FACTURA'}</span>
                            <span class="text-xs text-slate-500 ml-2">${new Date(sale.created).toLocaleString('es-VE')}</span>
                        </div>
                    </div>
                    
                    <div class="p-6 max-h-96 overflow-y-auto">
                        <div class="mb-4">
                            <div class="text-xs text-slate-400 uppercase font-bold mb-1">Items</div>
                            ${itemsHtml || '<div class="text-slate-400 italic text-xs">No hay items</div>'}
                        </div>
                        
                        <div class="border-t pt-4">
                            <div class="flex justify-between mb-2">
                                <span class="text-sm text-slate-600">Subtotal</span>
                                <span class="text-sm font-bold">$${(sale.total_usd || 0).toFixed(2)}</span>
                            </div>
                            <div class="flex justify-between mb-2">
                                <span class="text-sm text-slate-600">Tasa BCV</span>
                                <span class="text-sm font-bold">${(sale.dolartoday || 0).toFixed(2)} Bs/$</span>
                            </div>
                            <div class="flex justify-between text-lg font-bold border-t pt-2">
                                <span class="text-slate-800">Total</span>
                                <span class="text-indigo-600">${(sale.total_ves || 0).toFixed(2)} Bs</span>
                            </div>
                        </div>
                        
                        <div class="mt-6 p-3 bg-slate-50 rounded-lg">
                            <div class="text-xs text-slate-500">
                                <div class="flex justify-between">
                                    <span>Atendido por:</span>
                                    <span class="font-bold">${sale.user_email || 'Sistema'}</span>
                                </div>
                                <div class="flex justify-between mt-1">
                                    <span>Método de pago:</span>
                                    <span class="font-bold uppercase">${sale.payment_method || 'EFECTIVO'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="p-6 border-t">
                        <button onclick="this.closest('.fixed').remove()" class="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors">
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        document.body.appendChild(modalContainer);
        
        if (typeof lucide !== 'undefined') lucide.createIcons();
        
    } catch (error) {
        console.error("Error al cargar detalle de venta:", error);
        showToast("No se pudo cargar el detalle", 'error');
    }
}

// ==================== 18. GENERADOR DE TICKETS PDF ====================
function generateTicketPDF(invoiceNumber, items, totalVES, rate, date, paymentMethod) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: [80, 160] });
        
        // Encabezado
        doc.setFontSize(10).setFont(undefined, 'bold');
        doc.text(state.biz.name.toUpperCase(), 40, 10, { align: 'center' });
        doc.setFontSize(8).text(`RIF: ${state.biz.rif}`, 40, 14, { align: 'center' });
        
        // Datos
        doc.setFontSize(7).setFont(undefined, 'normal');
        doc.text(`FACTURA: ${invoiceNumber}`, 10, 22);
        doc.text(`FECHA: ${new Date(date).toLocaleString('es-VE')}`, 10, 26);
        doc.text(`TASA: ${rate.toFixed(2)} Bs/$`, 10, 30);
        doc.text(`PAGO: ${paymentMethod.toUpperCase()}`, 10, 34);
        
        doc.line(10, 36, 70, 36);
        
        // Items
        let y = 42;
        items.forEach(item => {
            const priceUSD = parseFloat(item.price) || 0;
            const priceVES = priceUSD * rate;
            const subtotalVES = priceVES * (item.qty || 1);
            
            doc.text(`${item.qty || 1}x ${item.name.slice(0, 18)}`, 10, y);
            doc.text(`${subtotalVES.toFixed(2)} Bs`, 70, y, { align: 'right' });
            y += 5;
        });
        
        // Totales
        doc.line(10, y + 2, 70, y + 2);
        doc.setFontSize(9).setFont(undefined, 'bold');
        doc.text(`TOTAL A PAGAR:`, 10, y + 8);
        doc.text(`${parseFloat(totalVES).toFixed(2)} Bs`, 70, y + 8, { align: 'right' });
        
        doc.setFontSize(7).setFont(undefined, 'normal');
        const totalUSD = totalVES / rate;
        doc.text(`REF: $${totalUSD.toFixed(2)}`, 10, y + 14);
        
        doc.save(`${invoiceNumber}.pdf`);
        
        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
            setTimeout(() => showToast("Ticket generado", 'success'), 500);
        }
        
    } catch (error) {
        console.error("Error al generar ticket:", error);
        showToast("Error al generar ticket", 'error');
    }
}

// ==================== 19. SCANNER QR ====================
async function startScanner() {
    const wrapper = document.getElementById('scanner-wrapper');
    if (!wrapper) return;
    
    wrapper.classList.add('active');
    
    if (!window.Html5Qrcode) {
        showToast("Scanner no disponible", 'error');
        wrapper.classList.remove('active');
        return;
    }
    
    html5QrCode = new Html5Qrcode("reader");
    
    try {
        await html5QrCode.start(
            { facingMode: "environment" },
            {
                fps: 10,
                qrbox: { width: 250, height: 150 },
                aspectRatio: 1.0
            },
            (decodedText) => {
                handleScannedCode(decodedText);
                stopScanner();
            }
        );
    } catch (error) {
        console.error("Error del scanner:", error);
        showToast("Error al iniciar cámara", 'error');
        wrapper.classList.remove('active');
    }
}

function stopScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            const wrapper = document.getElementById('scanner-wrapper');
            if (wrapper) wrapper.classList.remove('active');
            html5QrCode.clear();
        }).catch(error => {
            console.error("Error al detener scanner:", error);
        });
    }
}

function handleScannedCode(code) {
    const cleanCode = code.trim().toUpperCase();
    console.log("Código escaneado:", cleanCode);
    
    const product = state.products.find(p => p.produc_id && p.produc_id.toUpperCase() === cleanCode);
    
    if (product) {
        addToCart(product.id);
        showToast(`Escaneado: ${product.product_name}`, 'success');
        if (navigator.vibrate) navigator.vibrate(100);
    } else {
        showToast(`Código "${cleanCode}" no encontrado`, 'error');
    }
}

// ==================== 20. FILTROS ====================
function filterPOS() {
    const term = document.getElementById('pos-search')?.value.toUpperCase() || "";
    const cards = document.querySelectorAll('#product-grid > div');
    
    cards.forEach(card => {
        const text = card.innerText.toUpperCase();
        card.style.display = text.includes(term) ? '' : 'none';
    });
}

// ==================== 21. MONITOR DE TIEMPO ====================
function startTimeMonitor() {
    const checkTime = () => {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        
        if (hour === 19 && minute >= 30) {
            showToast("AVISO: Cierre próximo a las 8:00 PM", 'info');
        }
        
        if (hour >= 20) {
            const banner = document.getElementById('time-warning-banner');
            if (banner) {
                banner.classList.remove('hidden');
                banner.textContent = "⚠️ CICLO DEL SERVIDOR CAMBIADO. Las ventas se registrarán con fecha de mañana.";
            }
        }
    };
    
    checkTime();
    setInterval(checkTime, 60000);
}

// ==================== 22. LOGOUT ====================
async function handleLogout() {
    const confirmClose = confirm("⚠️ ADVERTENCIA\n\n¿Ya generó el reporte de cierre de caja de hoy?");
    
    if (confirmClose) {
        if (confirm("¿Está seguro de cerrar sesión?")) {
            // LIMPIAR LA TASA DE ESTA SESIÓN
            sessionStorage.removeItem('sisov_bcv_rate');
            sessionStorage.removeItem('sisov_bcv_rate_timestamp');
            
            pb.authStore.clear();
            window.location.reload();

             // Mostrar login, no recargar
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app-interface').style.display = 'none';
        
        showToast("Sesión cerrada", 'info');
        }
    } else {
        showToast("Genere el cierre antes de salir", 'error');
        switchTab('reports');
    }
}
// ==================== modal de cierre ============================
// Función para abrir el modal de selección
function openCloseReportModal() {
    const modal = document.getElementById('close-report-modal');
    const dateSpan = document.getElementById('close-report-date');
    
    if (modal && dateSpan) {
        const dateInput = document.getElementById('report-date');
        const targetDate = dateInput?.value || new Date().toISOString().split('T')[0];
        
        dateSpan.textContent = targetDate;
        modal.classList.add('active');
        
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

// Función para cerrar el modal
function closeReportModal() {
    const modal = document.getElementById('close-report-modal');
    if (modal) modal.classList.remove('active');
}

// Función para cierre simple (PDF básico)
async function generateSimpleCloseReport() {
    closeReportModal();
    await generateSimplePDF();
}

// Función para cierre detallado (PDF completo)
async function generateDetailedCloseReport() {
    closeReportModal();
    await generateDetailedPDF();
}

// ==================== 23. INICIALIZACIÓN FINAL ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log("%c 🛠️ SISOV PRO v2.1 cargado", "background: #1e293b; color: #3b82f6; padding: 2px 10px;");
    
    checkAuth();
    
    const reportDate = document.getElementById('report-date');
    if (reportDate) {
        const today = new Date().toISOString().split('T')[0];
        reportDate.value = today;
        reportDate.max = today;
    }
});

// ==================== 25. ELIMINAR PRODUCTO ====================
async function deleteProduct(productId) {
    if (!productId) {
        showToast("ID de producto no válido", 'error');
        return;
    }
    
    // Buscar el producto para mostrar nombre
    const product = state.products.find(p => p.id === productId);
    if (!product) {
        showToast("Producto no encontrado", 'error');
        return;
    }
    
    // Confirmación EXTRA SEGURA
    if (!confirm(`⚠️ ELIMINACIÓN PERMANENTE\n\nProducto: ${product.product_name}\nCódigo: ${product.produc_id || 'N/A'}\n\n¿ESTÁ ABSOLUTAMENTE SEGURO?\nEsta acción NO se puede deshacer.`)) {
        return;
    }
    
    try {
        // Eliminar de PocketBase
        await pb.collection('products').delete(productId);
        
        // Eliminar del estado local
        state.products = state.products.filter(p => p.id !== productId);
        
        // Eliminar del carrito si está presente
        state.cart = state.cart.filter(item => item.id !== productId);
        
        // Actualizar todas las vistas
        await fetchProducts();
        renderCart();
        renderInventory(currentInventoryFilter);
        
        showToast(`✅ Producto eliminado: ${product.product_name}`, 'success');
        
    } catch (error) {
        console.error("Error al eliminar producto:", error);
        showToast("Error al eliminar producto", 'error');
        
        // Si es error de conexión, intentar al menos eliminar localmente
        if (error.message.includes('Failed to fetch')) {
            state.products = state.products.filter(p => p.id !== productId);
            renderInventory(currentInventoryFilter);
            showToast("Producto eliminado localmente (sin conexión)", 'warning');
        }
    }
}

// Exponer globalmente
window.deleteProduct = deleteProduct;

// ==================== 24. EXPOSICIÓN GLOBAL ====================
window.showToast = showToast;
window.switchTab = switchTab;
window.openModal = openModal;
window.closeModal = closeModal;
window.cancelSale = cancelSale;
window.openRestockModal = openRestockModal;
window.closeRestock = closeRestock;
window.saveRestock = saveRestock;
window.openReduceModal = openReduceModal;
window.closeReduceStock = closeReduceStock;
window.saveReduceStock = saveReduceStock;
window.deleteProduct = deleteProduct;
window.filterPOS = filterPOS;
window.filterReports = filterReports;
window.handleLogout = handleLogout;
window.filterInventory = filterInventory;
window.openEditPrice = openEditPrice;
window.updateLivePriceVES = updateLivePriceVES;
window.closePriceModal = closePriceModal;
window.saveNewPrice = saveNewPrice;
window.startScanner = startScanner;
window.stopScanner = stopScanner;
window.processSale = processSale;
window.removeFromCart = removeFromCart;
window.openTasaModal = openTasaModal;
// ID: LGI_ALIAS_FIX
//window.fetchOfficialRate = fetchOfficialRateFromAPI;
window.syncManualInputWithAPI = syncManualInputWithAPI;
window.saveManualTasa = saveManualTasa;
window.cerrarModalTasa = cerrarModalTasa;
window.guardarNuevaTasa = guardarNuevaTasa;
window.generateDailyReport = generateDailyReport;
window.loadDailyReport = loadDailyReport;
window.viewSaleDetails = viewSaleDetails;
window.generateTicketPDF = generateTicketPDF;
window.renderInventory = renderInventory;
// Agregar al final del archivo, antes del último console.log:
window.openCloseReportModal = openCloseReportModal;
window.closeReportModal = closeReportModal;
window.generateSimpleCloseReport = generateSimpleCloseReport;
window.generateDetailedCloseReport = generateDetailedCloseReport;


console.log("%c ✅ Sistema completamente cargado", "color: #10b981; font-weight: bold;");