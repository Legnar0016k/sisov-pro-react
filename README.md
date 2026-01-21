# 🚀 SISOV PRO v3.0 - Sistema Inteligente de Operaciones

![SISOV PRO Banner](https://img.shields.io/badge/SISOV-PRO-v3.0-blue)
![License](https://img.shields.io/badge/License-MIT-green)
![PocketBase](https://img.shields.io/badge/Backend-PocketBase-orange)
![Responsive](https://img.shields.io/badge/Design-Responsive-purple)

**Sistema de Gestión Comercial Completo** - Punto de Venta, Inventario, Reportes y Administración
**v3.0 (Carpeta /v3):** Versión Beta. Arquitectura limpia, estructurada bajo el principio de inmutabilidad y modularidad. Diseñada como Base Sólida para escalar a versiones comerciales.
#============================================================================
## ✨ Características Principales

### 🛒 **Módulo de Ventas**
- ✅ Punto de venta rápido e intuitivo
- ✅ Búsqueda instantánea de productos
- ✅ Carrito de compras interactivo
- ✅ Múltiples métodos de pago
- ✅ Control de stock en tiempo real
- ✅ Facturación automática
- ✅ Escaneo de códigos QR (básico)
#============================================================================
### 📦 **Módulo de Inventario**
- ✅ Gestión completa de productos
- ✅ CRUD de productos (Crear, Leer, Actualizar, Eliminar)
- ✅ Control de stock con alertas
- ✅ Categorización de productos
- ✅ Historial de movimientos
- ✅ Precios en USD y conversión automática a Bs
#============================================================================
### 📊 **Módulo de Reportes**
- ✅ Dashboard con métricas en tiempo real
- ✅ Gráficos de ventas (Chart.js)
- ✅ Top productos más vendidos
- ✅ Reporte diario de ventas
- ✅ Exportación a PDF
- ✅ Historial completo de transacciones
#============================================================================
### 👥 **Módulo de Usuarios**
- ✅ Sistema de roles (Admin, Vendedor, Usuario)
- ✅ Creación de usuarios con validación
- ✅ Gestión de permisos por rol
- ✅ Verificación por email
- ✅ Seguridad con hashing de contraseñas
- ✅ Logs de auditoría
#============================================================================
### ⚙️ **Configuración**
- ✅ Tasa BCV configurable (API o manual)
- ✅ Gestión de usuarios del sistema
- ✅ Configuración de preferencias
- ✅ Sistema de notificaciones
- ✅ Backups automáticos (logs)
#============================================================================
## 🚀 Tecnologías Utilizadas

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| **HTML5** | - | Estructura del sistema |
| **CSS3/Tailwind** | 3.x | Estilos y diseño responsive |
| **JavaScript ES6+** | - | Lógica del frontend |
| **PocketBase** | 0.21.1 | Backend y base de datos |
| **Lucide Icons** | Latest | Íconos del sistema |
| **Chart.js** | 4.4.0 | Gráficos y reportes |
| **jsPDF** | 2.5.1 | Exportación a PDF |
| **SweetAlert2** | 11.x | Alertas y confirmaciones |
#============================================================================
## 📁 Estructura del Proyecto
sisov-pro-v3/
├── 📄 index.html # Página de inicio/redirección
├── 📄 login.html # Sistema de autenticación
├── 📄 sistema.html # Sistema principal (dashboard)
├── 📄 crear-usuario.html # Gestión de usuarios
├── 📄 pb_schema.json # Esquema de base de datos
│
├── 📂 assets/ # Recursos estáticos
│ ├── 📂 icons/ # Íconos personalizados
│ └── 📂 fonts/ # Fuentes tipográficas
│
├── 📂 docs/ # Documentación
│ ├── 📄 INSTALLATION.md # Guía de instalación
│ ├── 📄 USER_GUIDE.md # Manual de usuario
│ └── 📄 API_REFERENCE.md # Referencia de API
│
└── 📄 README.md # Este archivo
#============================================================================
## 🛠️ Instalación y Configuración

### Prerrequisitos
- Node.js (opcional, para desarrollo)
- PocketBase 0.21.1 o superior
- Navegador moderno (Chrome 90+, Firefox 88+, Safari 14+)
- Servidor web (Apache, Nginx, o servir estáticamente)

### Paso 1: Instalar PocketBase
```bash
# Descargar PocketBase
wget https://github.com/pocketbase/pocketbase/releases/download/v0.21.1/pocketbase_0.21.1_linux_amd64.zip
unzip pocketbase_0.21.1_linux_amd64.zip

# O usando Docker
docker run -p 8090:8090 ghcr.io/pocketbase/pocketbase:latest serve --http="0.0.0.0:8090"

# 1. Iniciar PocketBase
./pocketbase serve

# 2. Abrir panel de administración
# http://localhost:8090/_/

# 3. Importar esquema (pb_schema.json)
# Desde la interfaz web de PocketBase

curl -X POST http://localhost:8090/api/collections/users/records \
     -H "Content-Type: application/json" \
     -d '{
       "email": "admin@empresa.com",
       "password": "Admin123!",
       "passwordConfirm": "Admin123!",
       "user_name": "Administrador",
       "user_role": "admin",
       "verified": true
     }'


#============================================================================
Configurar tasa BCV:

Ir a Configuración → Tasa de Cambio

Ingresar tasa manual o usar API

Agregar productos iniciales:

Ir a Inventario → Nuevo Producto

Completar información básica

📱 Uso del Sistema
Inicio de Sesión
Acceder a login.html

Ingresar credenciales (email y contraseña)

El sistema redirige automáticamente

Realizar una Venta
Seleccionar productos:

Buscar por nombre, SKU o categoría

Click en "Agregar" o escanear código

Verificar stock disponible

Procesar pago:

Seleccionar método de pago

Verificar total en USD y Bs

Click en "Procesar Venta"

Imprimir o enviar factura

Gestionar Inventario
Ver inventario: Pestaña "Inventario"

Agregar producto: Botón "Nuevo Producto"

Actualizar stock: Click en ícono de edición

Filtrar: Por stock bajo, agotados, categoría

Generar Reportes
Dashboard principal: Ver métricas del día

Reporte diario: Seleccionar fecha

Exportar PDF: Click en "Exportar Reporte"

Ver gráficos: Tendencias de ventas

🔒 Seguridad
Autenticación
JWT Tokens: Sesiones seguras con expiración

Hash de contraseñas: bcrypt/argon2 en servidor

Validación de email: Opcional

Roles y permisos: Control de acceso granular

Protecciones
HTTPS recomendado: Para producción

CORS configurado: Orígenes permitidos

Rate limiting: Protección contra ataques

Validación de entrada: Frontend y backend

Logs de auditoría: Todas las acciones registradas