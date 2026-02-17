/**
 * @file app-manager.js
 * @description Cerebro central de SISOV PRO.
 */

const AppManager = {
    version: "3.5.0",
    
    async inicializar() {
        console.log(`%c[APP-MANAGER] Iniciando...`, "color: #00ff00;");
        
        // 1. Cargar lucide
        await this.cargarScript('https://unpkg.com/lucide@latest');
        
        // 2. Cargar núcleo
        await this.cargarScript('core/core.js');
        await this.cargarScript('core/auth-security.js');
        await this.cargarScript('core/time-module.js');
        
        // 3. Cargar módulos
        await this.cargarScript('core/ventas.js');
        await this.cargarScript('core/inventario.js');
        await this.cargarScript('core/reportes.js');
        await this.cargarScript('core/configuracion.js');
        
        // 4. Inicializar lucide
        if (window.lucide) lucide.createIcons();
        
        // 5. Inicializar sistema (UNA SOLA VEZ)
        await window.Sistema.inicializar();
        
        // 6. Ocultar splash
        document.getElementById('splashScreen')?.classList.add('hidden');
    },

    cargarScript(src) {
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = resolve; // No fallamos
            document.head.appendChild(script);
        });
    }
};

document.addEventListener('DOMContentLoaded', () => AppManager.inicializar());