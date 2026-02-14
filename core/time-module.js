//======================================================//
//========= TIME-MODULE.JS (Módulo de Tiempo) ==========//
//======================================================//

const TimeModule = {
    meses: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"],

    // Función para mostrar el modal (Antes estaba en Sistema)
    mostrarInforme() {
        const modal = document.getElementById('modalTiempo');
        if (modal) {
            modal.classList.remove('hidden');
            console.log("[TIME] Informe detallado desplegado");
        }
    },

    // Función de actualización visual (Llamada desde el setInterval del Core)
    actualizarUI(tiempoActual) {
        // 1. Cálculos de Hora
        const h = tiempoActual.getHours();
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        const m = String(tiempoActual.getMinutes()).padStart(2, '0');
        const s = String(tiempoActual.getSeconds()).padStart(2, '0');
        
        // 2. Cálculos de Fecha
        const dia = String(tiempoActual.getDate()).padStart(2, '0');
        const mesNum = String(tiempoActual.getMonth() + 1).padStart(2, '0');
        const anio = tiempoActual.getFullYear();

        // 3. Actualizar Header (Pequeño)
        this.setElementText('headerClock', `${h12}:${m}:${s}`);
        this.setElementText('clockPeriod', ampm);
        this.setElementText('headerDate', `${dia}/${mesNum}/${anio}`);

        // 4. Actualizar Modal (Gigante - Cegato friendly)
        this.setElementText('bigClock', `${h12}:${m}:${s}`);
        this.setElementText('bigPeriod', ampm);
        this.setElementText('bigDate', `${dia} de ${this.meses[tiempoActual.getMonth()]} de ${anio}`);
    },

    setElementText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }
};

// Exponer globalmente
window.TimeModule = TimeModule;