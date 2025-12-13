# Diseño de Extensión Firefox: Monitor de Bloqueos de Red

## 1. Introducción
Esta extensión tiene como objetivo ayudar a los usuarios de sistemas con listas blancas (whitelists) estrictas (como el proyecto actual basado en `dnsmasq` e `iptables`) a identificar qué dominios están impidiendo el correcto funcionamiento de una página web.

## 2. El Problema
Cuando se navega en un entorno de lista blanca restrictiva:
1. El usuario visita `ejemplo.com` (permitido).
2. `ejemplo.com` intenta cargar recursos de `cdn.ejemplo-static.com` o `api.tercero.com`.
3. Estos dominios secundarios no están en la whitelist.
4. El sistema operativo/DNS devuelve un error (NXDOMAIN, Connection Refused, etc.).
5. La página se ve rota o no funciona, pero el navegador no muestra explícitamente qué falló sin abrir las herramientas de desarrollador.

## 3. La Solución Propuesta
Una extensión de Firefox que:
- Monitorea pasivamente todas las peticiones de red de la pestaña activa.
- Detecta aquellas que fallan con códigos de error específicos asociados a bloqueos (ej. error de resolución DNS).
- Muestra un contador en la barra de herramientas.
- Permite listar y copiar estos dominios fallidos para facilitar su adición a la whitelist mediante `whitelist-cmd.sh`.

## 4. Alcance
- **Navegador:** Firefox (compatible con Manifest V2 y V3, preferible V2 para acceso más estable a APIs de bajo nivel en Linux, aunque V3 es el estándar futuro).
- **Detección:** Errores de red (`onErrorOccurred`). No inspecciona contenido, solo cabeceras y estado.
- **Privacidad:** Los datos se mantienen en memoria volátil (per-tab) y no se envían a ningún servidor externo.
