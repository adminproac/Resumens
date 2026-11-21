# Hoja de vida de Myrima Rocio Duarte Caceres

Sitio estático bilingüe (español / inglés) para consultar y editar la hoja de vida de Myrima Rocio Duarte Caceres. Los textos, las secciones y los formularios salen de `cv-data.json`: cada campo legible está en `{"en","es"}`, cada registro tiene `id`, `order`, `createdAt` y `updatedAt`, y los bloques `schema` y `ui` describen tipos, validación, controles y etiquetas.

**En vivo:** [https://adminproac.github.io/Resumens/](https://adminproac.github.io/Resumens/)

React 19.3.1 y Vite 8.3.8. No hay servidor propio. Al abrir la página, el navegador lee `cv-data.json` directo de GitHub (`raw.githubusercontent.com` en `main`, con caché desactivada), no de la copia que publica GitHub Pages. Así se ve el archivo actual sin esperar el redespliegue.

## Ejecutar en local

Requiere Node.js 22.12 o superior.

```bash
npm ci
npm test
npm run dev
```

El servidor de desarrollo queda en [http://localhost:5173/Resumens/](http://localhost:5173/Resumens/). La hoja de vida es la vista inicial. **Editar** abre la administración (`?vista=editar`).

Para generar el sitio estático:

```bash
npm run build
npm run preview
```

La vista previa usa el mismo prefijo `/Resumens/`.

## Idioma

El idioma inicial es `es` (`meta.defaultLanguage`). El selector **Español / Inglés** cambia los datos y las etiquetas, y la elección se recuerda en `localStorage` (`resumens.lang`).

## Cómo se guardan las ediciones

En **Editar**, cada alta, cambio, borrado o reorden escribe el `cv-data.json` completo en la rama `main` del repositorio `adminproac/Resumens`, mediante la API de contenidos de GitHub (lee el `sha` actual y luego hace `PUT`). Si el `sha` chocó con otro commit, se vuelve a leer una vez y se reintenta. El mensaje del commit describe la sección y el registro.

Eso solo ocurre si este navegador está conectado con un token. El token no va en el repositorio: se guarda en `localStorage` de este navegador y se quita con **Desconectar**.

Si GitHub no responde, la última copia queda en `localStorage` (`resumens.cv.v1`) para poder seguir viendo la hoja. Al volver a cargar, si el archivo del repositorio es igual o más reciente, ese archivo gana: una copia vieja del navegador no lo tapa. Si el navegador tiene ediciones más nuevas que aún no se publicaron, la vista de edición lo avisa y ofrece **Publicar en GitHub**.

**Exportar JSON** sigue disponible como respaldo. **Importar JSON** también intenta escribir el archivo en GitHub. **Volver a leer de GitHub** descarta lo que este navegador no haya publicado y vuelve a cargar `cv-data.json`.

El perfil es un solo registro: el esquema permite actualizarlo y no crear ni borrar otro. El resto de secciones (resumen, experiencia y sus logros, otra experiencia, educación, grupos e ítems de habilidades, idiomas e información adicional) se pueden agregar, filtrar, editar, reordenar y eliminar. Eliminar pide confirmación. Los campos localizados se capturan en español y en inglés.

## Conectar con GitHub (una sola vez en este navegador)

1. En la hoja de vida, abra **Editar** y pulse **Conectar con GitHub**.
2. Cree un token fino en [https://github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new).
3. En acceso al repositorio, elija solo `adminproac/Resumens`.
4. En permisos del repositorio, ponga **Contents** en **Read and write**. El resto puede quedar sin acceso.
5. Genere el token, péguelo en el campo y pulse **Probar conexión**. Debe decir que puede escribir y mostrar su usuario de GitHub. Si no puede, el aviso incluye el código HTTP y el mensaje exacto de GitHub; el token no se guarda.
6. Pulse **Conectar con GitHub**. La barra queda en **Conectado como** su usuario. A partir de ahí, **Guardar**, **Actualizar**, **Eliminar**, reordenar e **Importar JSON** crean un commit en `main`. El enlace **Último commit exitoso** abre ese commit. Si hay cambios solo en el navegador, use **Publicar en GitHub**.

El token puede editar archivos de ese repositorio; la aplicación solo escribe `cv-data.json`. No lo comparta ni lo suba a Git. Cuando no lo necesite, use **Desconectar** o revoque el token en GitHub. Cada navegador o dispositivo hay que conectarlo aparte.

Un commit a `cv-data.json` dispara el flujo de GitHub Pages. Si hay varios guardados seguidos, el grupo de concurrencia cancela el despliegue que todavía no terminó y publica el más reciente.

## Despliegue

El flujo (`.github/workflows/pages.yml`) prueba, construye y publica en GitHub Pages en cada push a `main`. La base de Vite es `/Resumens/`. En el repositorio, Pages debe usar **Settings → Pages → Source: GitHub Actions**.
