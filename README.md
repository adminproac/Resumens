# Hoja de vida de Jesús Edgar Duarte

Sitio estático bilingüe (español / inglés) para consultar y editar la hoja de vida de Jesús Edgar Duarte. Los textos, las secciones y los formularios salen de `cv-data.json`: cada campo legible está en `{"en","es"}`, cada registro tiene `id`, `order`, `createdAt` y `updatedAt`, y los bloques `schema` y `ui` describen tipos, validación, controles y etiquetas.

**En vivo:** [https://adminproac.github.io/Resumens/](https://adminproac.github.io/Resumens/)

React 19.3.1 y Vite 8.3.8. No hay servidor: el navegador muestra la hoja de vida y, en la vista de edición, permite crear, buscar, actualizar y eliminar registros.

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

`cv-data.json` es la copia original que viaja con el repositorio. Al abrir la aplicación se usa ese archivo. Cada alta, edición, borrado o reorden se guarda encima, en este navegador, bajo la clave `resumens.cv.v1`. Esos cambios no se suben solos a GitHub.

En la vista de edición:

- **Exportar JSON** descarga el estado actual como `cv-data.json`.
- **Importar JSON** lee un archivo con la misma forma (`meta`, `profile`, `schema`, `ui` y las secciones) y lo deja como datos de este navegador.
- **Restablecer datos originales** borra lo guardado en el navegador y vuelve a mostrar `cv-data.json`.

Si el archivo del repositorio cambia y el navegador todavía tiene ediciones viejas, la vista de edición avisa. Puede seguir con los cambios locales o restablecer.

El perfil es un solo registro: el esquema permite actualizarlo y no crear ni borrar otro. El resto de secciones (resumen, experiencia y sus logros, otra experiencia, educación, grupos e ítems de habilidades, idiomas e información adicional) se pueden agregar, filtrar, editar, reordenar y eliminar. Eliminar pide confirmación. Los campos localizados se capturan en español y en inglés. Las fechas `updatedAt` y `createdAt`, el `id` y el `order` se mantienen al guardar.

## Volver a dejar los cambios en `cv-data.json`

1. En la vista de edición, pulse **Exportar JSON**.
2. Reemplace el archivo `cv-data.json` de la raíz del repositorio con esa descarga.
3. Revise el diff, haga commit y súbalo a `main`.
4. En los navegadores que ya tenían ediciones locales, use **Restablecer datos originales** después del despliegue para que lean el archivo nuevo.

El flujo de GitHub Actions (`.github/workflows/pages.yml`) prueba, construye y publica en GitHub Pages en cada push a `main`. La base de Vite es `/Resumens/`. En el repositorio, Pages debe usar **Settings → Pages → Source: GitHub Actions**.
