# Backend setup

## Environment variables

Create a `.env` file (or update the existing one) with the following values in addition to the DB and JWT settings you already use:

```
EMAIL_USER=tu-cuenta@gmail.com
EMAIL_PASS=contraseña-o-app-password
FRONTEND_BASE_URL=http://localhost:5173
```

- `EMAIL_USER` / `EMAIL_PASS` must belong to una cuenta Gmail. Lo recomendable es generar un "App password" desde <https://myaccount.google.com/apppasswords> y no reutilizar tu contraseña normal.
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
2. Abre la vista en el frontend y solicita la recuperación.
3. Revisa la bandeja de entrada/spam del Gmail configurado y copia el token.
4. Completa el formulario de actualización y confirma que llega el correo final.

## Programa de referencia Mercado Libre

Dentro de `scripts/mercadoLibreRentals.js` hay un ejemplo completo de cómo usar la **API oficial de Mercado Libre** para obtener:

- Resultados de búsqueda filtrados por arriendo (`/sites/{SITE_ID}/search` con `OPERATION=242075`, `PROPERTY_TYPE=242062`, etc.).
- Detalle de un aviso puntual (`/items/{ITEM_ID}` y `/items/{ITEM_ID}/description`).
- Perfil del vendedor/inmobiliaria (`/users/{USER_ID}`).

Ejecuta el demo con:

```powershell
cd backend
node scripts/mercadoLibreRentals.js
```

**Requisitos:** Node.js 18+ (para `fetch` nativo) y conexión a internet. Ajusta filtros/IDs dentro del script para cambiar región, tipo de propiedad o site (`MLC`, `MLA`, `MLB`, etc.).
