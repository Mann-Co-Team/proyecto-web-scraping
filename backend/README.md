# Backend setup

## Environment variables

Create a `.env` file (or update the existing one) with the following values in addition to the DB and JWT settings you already use:

```
EMAIL_USER=notificaciones@tu-dominio.cl
EMAIL_PASS=app-password-o-contraseña
EMAIL_SERVICE=gmail            # opcional si usas un proveedor que Nodemailer conoce por nombre
EMAIL_HOST=smtp.tu-dominio.cl  # usa host/port/secure si prefieres SMTP explícito
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_FROM="HabiTalca <notificaciones@tu-dominio.cl>"
FRONTEND_BASE_URL=http://localhost:5173
```

- `EMAIL_USER` / `EMAIL_PASS` deben pertenecer a la casilla que enviará los mensajes.
- Si usas Gmail:
   - Activa la verificación en dos pasos (2FA).
   - Crea una **contraseña de aplicación** en tu cuenta de Google y úsala como `EMAIL_PASS` (las contraseñas normales ya no funcionan para SMTP directo).
- Usa `EMAIL_SERVICE` **o** (`EMAIL_HOST` + `EMAIL_PORT` + `EMAIL_SECURE`):
   - Con Gmail u Outlook basta con indicar `EMAIL_SERVICE=gmail` o `EMAIL_SERVICE=hotmail` y un app password.
   - Con un proveedor SMTP propio, especifica host, puerto y si la conexión es segura (`true/false`).
- `EMAIL_FROM` permite personalizar el remitente que verán los usuarios; por defecto se usa `HabiTalca <EMAIL_USER>`.
- `FRONTEND_BASE_URL` se usa para construir el enlace que llega en el correo. Ajusta si sirves la vista desde otra URL/puerto.

## Password reset flow

1. El usuario abre la vista pública, selecciona **¿Olvidaste tu contraseña?**, ingresa su correo @gmail y envía la solicitud.
2. El backend guarda un token por 60 minutos y envía un correo con el token + enlace directo que incluye `?resetToken=<token>`.
3. El usuario copia el token del correo y lo pega en la sección **Token recibido** del modal.
4. Al confirmar, la contraseña se actualiza y se envía un segundo correo de confirmación.

### Endpoints (para pruebas manuales)

```
POST /api/auth/forgot-password { "email": "usuario@gmail.com" }
POST /api/auth/reset-password { "token": "<token>", "password": "nuevaClave" }
```

Si no se detectan credenciales de Gmail, la API sigue funcionando pero la respuesta incluye `token` para poder probar el flujo de forma manual.

## Verificación manual

1. Inicia el backend:
   ```powershell
   cd backend
   npm install
   npm run dev
   ```
2. (Opcional) Verifica la configuración SMTP sin tocar la aplicación:
   ```powershell
   npm run email:test -- --to=correo@destino.cl
   ```
   El script usa `EMAIL_USER`/`EMAIL_PASS` y reporta si las credenciales fueron rechazadas o si hay un problema de conexión.
3. Abre la vista en el frontend y solicita la recuperación.
4. Revisa la bandeja de entrada/spam del correo configurado y copia el token.
5. Completa el formulario de actualización y confirma que llega el correo final.

## Programa de referencia Mercado Libre

Dentro de `src/services/mercadoLibreRentals.js` hay un ejemplo completo de cómo usar la **API oficial de Mercado Libre** para obtener:

- Resultados de búsqueda filtrados por arriendo (`/sites/{SITE_ID}/search` con `OPERATION=242075`, `PROPERTY_TYPE=242062`, etc.).
- Detalle de un aviso puntual (`/items/{ITEM_ID}` y `/items/{ITEM_ID}/description`).
- Perfil del vendedor/inmobiliaria (`/users/{USER_ID}`).

Ejecuta el demo con:

```powershell
cd backend
node src/services/mercadoLibreRentals.js
```

**Requisitos:** Node.js 18+ (para `fetch` nativo) y conexión a internet. Ajusta filtros/IDs dentro del script para cambiar región, tipo de propiedad o site (`MLC`, `MLA`, `MLB`, etc.).
