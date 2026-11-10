// Achica la foto en el navegador antes de subirla (máx. 900 px, JPG)
export const comprimir = (archivo, max = 900) =>
  new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      ok(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => mal(new Error("No se pudo leer la imagen."));
    img.src = URL.createObjectURL(archivo);
  });
