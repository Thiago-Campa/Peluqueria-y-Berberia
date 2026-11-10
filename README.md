# Peluquería: turnos, precios y panel admin

Un solo proyecto: la web (React + Vite) y la API (`/api`) viven juntas.

```
peluqueria/
├─ index.html, vite.config.js, vercel.json, package.json
├─ src/        → la web (components, css, js)
├─ api/        → entrada de la API para Vercel
└─ server/     → lógica del servidor (rutas, guardado de datos)
```

## Correrlo en tu compu (1 comando)
```bash
npm install
npm run dev
```
Abrí http://localhost:5173 — el panel está en http://localhost:5173/#/admin
Contraseña por defecto: `admin1234`. Localmente los datos quedan en `data/db.json`.

## Subirlo a Vercel
1. Subí esta carpeta a GitHub (la raíz del repo debe ser donde está `package.json`).
2. En Vercel: **Add New → Project** → elegí el repo. Framework: Vite (lo detecta solo). No cambies nada más.
3. Antes de usarlo, en el proyecto de Vercel: **Storage → Create Database → Upstash Redis** (plan gratis) y conectalo al proyecto. Esto guarda turnos, precios y fotos.
4. En **Settings → Environment Variables** agregá `ADMIN_PASSWORD` con tu clave.
5. **Deployments → Redeploy** para que tome las variables.

Sin el paso 3, la web carga pero los cambios del panel y los turnos no se guardan (Vercel no permite escribir archivos).
