---
title: Referencia de API
audience: Developers que integran o extienden panda
prerequisites: TypeScript y el paquete que quieres usar instalados
outcome: Encontrar la API pública generada de cada paquete publicable
scope: Exportaciones públicas de TypeScript de los paquetes publicables
compatibility: Se genera desde las exportaciones del código fuente durante los checks y builds de documentación
translationStatus: translated
---
# Referencia de API

La <a href="/panda/api/">referencia de API generada</a> se construye directamente desde el entrypoint público de TypeScript de cada paquete publicable. No es un inventario escrito a mano: el workflow de documentación la regenera antes de validar y antes de construir el sitio.

## Camino rápido

1. Instala el paquete dueño del límite que necesitas.
2. Abrí la referencia generada y elegí el módulo del paquete.
3. Tomá los tipos y funciones exportados como la superficie pública; los archivos internos no son documentación de API.

El HTML generado es un artefacto del build. No se guarda en Git y se publica únicamente como parte del sitio de documentación construido.
