/**
 * @file time-module.js
 * @description Módulo de tiempo mejorado
 */

const TimeModule = {
    meses: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"],
    dias: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
    
    mostrarInforme() {
        const modal = document.getElementById('modalTiempo');
        if (modal) {
            modal.classList.remove('hidden');
            
            // Actualizar con hora actual
            const ahora = window.Sistema?.estado?.config?.serverTime || new Date();
            this.actualizarUIModal(ahora);
            
            console.log("[TIME] Informe desplegado");
        }
    },
    
    actualizarUI(tiempoActual) {
        if (!tiempoActual) return;
        
        // Formatear hora
        const h = tiempoActual.getHours();
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        const m = String(tiempoActual.getMinutes()).padStart(2, '0');
        const s = String(tiempoActual.getSeconds()).padStart(2, '0');
        
        // Formatear fecha
        const dia = String(tiempoActual.getDate()).padStart(2, '0');
        const mes = String(tiempoActual.getMonth() + 1).padStart(2, '0');
        const anio = tiempoActual.getFullYear();
        
        // Actualizar header
        this.setText('headerClock', `${h12}:${m}:${s}`);
        this.setText('clockPeriod', ampm);
        this.setText('headerDate', `${dia}/${mes}/${anio}`);
        
        // Actualizar modal si está visible
        if (!document.getElementById('modalTiempo')?.classList.contains('hidden')) {
            this.actualizarUIModal(tiempoActual);
        }
    },
    
    actualizarUIModal(tiempo) {
        const h = tiempo.getHours();
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        const m = String(tiempo.getMinutes()).padStart(2, '0');
        const s = String(tiempo.getSeconds()).padStart(2, '0');
        
        const diaSemana = this.dias[tiempo.getDay()];
        const dia = tiempo.getDate();
        const mes = this.meses[tiempo.getMonth()];
        const anio = tiempo.getFullYear();
        
        this.setText('bigClock', `${h12}:${m}:${s}`);
        this.setText('bigPeriod', ampm);
        this.setText('bigDate', `${diaSemana}, ${dia} de ${mes} de ${anio}`);
    },
    
    setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    },
    
    formatearFechaHora(tiempo) {
        if (!tiempo) tiempo = new Date();
        
        const opciones = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        };
        
        return tiempo.toLocaleDateString('es-VE', opciones);
    }
};

window.TimeModule = TimeModule;