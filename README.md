# Peluquería y Barbería: turnos, precios y panel admin (con Neon)

## 1. Variables de entorno
Copiá `.env.example` como `.env` (en la raíz, junto a `package.json`) y completalo:
- `DATABASE_URL`: cadena de conexión de Neon (botón **Connect**, con *Connection pooling* activado).
- `ADMIN_PASSWORD`: la contraseña del panel.
- `ADMIN_SECRET`: una clave larga cualquiera, para firmar la sesión del admin.

El `.env` está en el `.gitignore`: no se sube a GitHub.

- `MAIL_USER`, `MAIL_PASS` y `MAIL_NOMBRE`: para el correo de confirmación de turnos (ver sección 1b).

## 1b. Correo de confirmación (Gmail)
1. En la cuenta de Gmail que va a enviar los mails, activá la **verificación en 2 pasos**.
2. Entrá a https://myaccount.google.com/apppasswords y creá una **contraseña de aplicación** (16 letras).
3. En el `.env` (y en Vercel → Environment Variables): `MAIL_USER=tucorreo@gmail.com`, `MAIL_PASS=` esa contraseña sin espacios, `MAIL_NOMBRE=Nombre de tu peluquería`.
4. Corré `npm install` (se agregó `nodemailer`).

Sin estas variables la reserva funciona igual, pero no se manda el correo y en pantalla se avisa.

## 1c. Cobrar la seña con Mercado Pago
1. Entrá a https://www.mercadopago.com.ar/developers con **la cuenta de Mercado Pago donde querés recibir los pagos** (la de la peluquería).
2. *Tus integraciones → Crear aplicación* → producto **Checkout Pro**.
3. En *Credenciales de producción* copiá el **Access Token** y cargalo como `MP_ACCESS_TOKEN` (en `.env` y en Vercel).
4. En Vercel cargá `BASE_URL` con la dirección real de la página (ej. `https://tu-sitio.vercel.app`).
5. En el admin → *Datos del local* elegí el **% de seña** (0 = no cobrar).
Para probar sin plata real, usá las credenciales de prueba y usuarios de prueba de Mercado Pago.
El turno queda "pendiente" 15 minutos hasta que se paga; si no paga, el horario se libera solo.
En tu compu el aviso automático (webhook) no llega, pero al volver de Mercado Pago el sitio confirma el pago igual.

## 1d. Mis turnos y cancelaciones
Con la sesión iniciada, el cliente ve la sección **Mis turnos** (también en el menú) con sus reservas ordenadas del turno más cercano al más lejano, cuánto falta para cada una y si todavía puede recuperar la seña.
- Si cancela con **1 hora o más** de anticipación, la seña se le devuelve sola por Mercado Pago.
- Si falta **menos de 1 hora**, puede cancelar igual, pero la seña no se devuelve (antes se le pregunta de nuevo).
- Un turno que ya empezó no se puede cancelar.
- Los cancelados quedan en el **Historial** del cliente y el horario se libera para otra persona.

Para calcular cuánto falta se usa la hora de Argentina. Si el local está en otra zona, cargá `ZONA_HORARIA` (ej. `America/Montevideo`). Las horas de anticipación se cambian en `ANTICIPO_MIN`, al principio de `server/app.js`.

## 2. Correrlo en tu compu (2 terminales)
```bash
npm install

# Terminal 1: servidor
npm run server

# Terminal 2: página
npm run dev
```
Abrí http://localhost:5173. Las tablas se crean solas en el primer pedido. Si querés crearlas antes: `npm run db:init`.

## 3. Panel admin
http://localhost:5173/#/admin: cortes (precio, duración y foto), peluqueros, horarios, WhatsApp, Instagram, dirección, fondo claro/oscuro, turnos.

## 4. Publicarlo en Vercel
En el proyecto de Vercel, **Settings → Environment Variables**:
- `DATABASE_URL`: la crea sola la integración con Neon.
- `ADMIN_PASSWORD` y `ADMIN_SECRET`: cargalas vos. Sin `ADMIN_PASSWORD`, el panel no deja entrar.

Después subí los cambios a GitHub (o hacé **Redeploy**).

## Qué guarda la base
Datos del local, peluqueros, cortes, fotos de los cortes y turnos. Los turnos se reservan dentro de una transacción: si dos personas piden el mismo horario con el mismo peluquero, se confirma solo la primera.
