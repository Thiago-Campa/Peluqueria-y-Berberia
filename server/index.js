// Servidor para correr en tu compu (npm run server). En Vercel se usa api/index.js.
import app from "./app.js";

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) console.log("Contraseña de admin: admin1234 (cambiala con ADMIN_PASSWORD en el .env)");
});
