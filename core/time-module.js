/**
 * @file time-module.js
 * @description Módulo de tiempo mejorado con fallback local
 */

const TimeModule = {
    meses: ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"],
    dias: ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
    _intervalo: null,
    _horaActual: null,
    
    async inicializar() {
        console.log("[TIME] Inicializando módulo de tiempo...");
        
        // Intentar sincronizar con servidor, pero usar local siempre como respaldo
        try {
            await this.sincronizarConServidor();
        } catch (error) {
            console.warn("[TIME] Usando hora local como respaldo");
            this._horaActual = new Date();
        }
        
        // Iniciar el reloj
        this.iniciarReloj();
    },
    
    async sincronizarConServidor() {
        try {
            const response = await fetch('https://worldtimeapi.org/api/timezone/America/Caracas');
            const data = await response.json();
            
            if (data.datetime) {
                this._horaActual = new Date(data.datetime);
                console.log("[TIME] Sincronizado con servidor:", this._horaActual);
                return true;
            }
        } catch (error) {
            console.warn("[TIME] Error sincronizando con servidor:", error);
        }
        return false;
    },
    
    iniciarReloj() {
        if (this._intervalo) clearInterval(this._intervalo);
        
        this._intervalo = setInterval(() => {
            if (this._horaActual) {
                this._horaActual = new Date(this._horaActual.getTime() + 1000);
            } else {
                this._horaActual = new Date();
            }
            this.actualizarUI(this._horaActual);
        }, 1000);
    },
    
    mostrarInforme() {
        const modal = document.getElementById('modalTiempo');
        if (modal) {
            modal.classList.remove('hidden');
            const ahora = this._horaActual || new Date();
            this.actualizarUIModal(ahora);
        }
    },
    
    actualizarUI(tiempoActual) {
        if (!tiempoActual) return;
        
        const h = tiempoActual.getHours();
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        const m = String(tiempoActual.getMinutes()).padStart(2, '0');
        const s = String(tiempoActual.getSeconds()).padStart(2, '0');
        
        const dia = String(tiempoActual.getDate()).padStart(2, '0');
        const mes = String(tiempoActual.getMonth() + 1).padStart(2, '0');
        const anio = tiempoActual.getFullYear();
        
        this.setText('headerClock', `${h12}:${m}:${s}`);
        this.setText('clockPeriod', ampm);
        this.setText('headerDate', `${dia}/${mes}/${anio}`);
        
        const modal = document.getElementById('modalTiempo');
        if (modal && !modal.classList.contains('hidden')) {
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
        if (!tiempo) tiempo = this._horaActual || new Date();
        
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

// Auto-inicializar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TimeModule.inicializar());
} else {
    TimeModule.inicializar();
}

window.TimeModule = TimeModule;