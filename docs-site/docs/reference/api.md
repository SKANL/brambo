---
title: API reference
audience: Developers integrating or extending panda
prerequisites: TypeScript and the package you want to use installed
outcome: Find the generated public API for every publishable package
scope: Public TypeScript exports from publishable packages
compatibility: Generated from repository source exports during docs checks and builds
translationStatus: original
---
# API reference

The <a href="/panda/api/">generated API reference</a> is built directly from the public TypeScript entrypoint of every publishable package. It is not a hand-written inventory: the docs workflow regenerates it before validation and before the site build.

## Quick path

1. Install the package that owns the boundary you need.
2. Open the generated reference and select its package module.
3. Treat the exported types and functions as the public surface; internal source files are not API documentation.

The generated HTML is a build artifact. It stays out of Git and is published only as part of the built documentation site.
