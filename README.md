# Sistema de Control de Acceso a Internet - Whitelist

## ¿Qué es esto?

Este sistema permite **controlar qué páginas web se pueden visitar** desde un ordenador. Solo se podrá acceder a las páginas que estén en una lista aprobada (llamada "whitelist" o "lista blanca"). Todas las demás páginas estarán bloqueadas.

Es ideal para:
- Aulas de informática en colegios e institutos
- Ordenadores compartidos por estudiantes
- Entornos educativos donde se necesite limitar el acceso a internet

## ¿Cómo funciona?

El sistema funciona de manera automática una vez instalado:

1. **Descarga una lista de páginas permitidas** desde internet cada 5 minutos
2. **Bloquea todo el tráfico** excepto las páginas de esa lista
3. **Si no puede descargar la lista** (por ejemplo, si no hay internet), permite el acceso libre para no interrumpir las clases

## Requisitos

- Ordenador con Ubuntu o Debian (Linux)
- Conexión a internet
- Permisos de administrador (usuario root)

## Instalación (Paso a Paso)

### 1. Descargar el sistema

Primero, descarga los archivos necesarios. Abre una **Terminal** y escribe:

```bash
cd ~
git clone https://github.com/balejosg/whitelist.git
cd whitelist
```

Si no tienes `git` instalado, primero ejecuta:
```bash
sudo apt-get update
sudo apt-get install git
```

### 2. Ejecutar el instalador

Una vez descargado, ejecuta el instalador con permisos de administrador:

```bash
sudo ./setup-dnsmasq-whitelist.sh
```

El instalador te preguntará la IP de tu router (normalmente la detecta automáticamente). Si no estás seguro, generalmente es `192.168.1.1` o `192.168.0.1`.

### 3. Esperar a que termine

La instalación tardará unos minutos. Verás mensajes en pantalla indicando el progreso. Al finalizar, verás un mensaje que dice **"¡Instalación completada exitosamente!"**

### 4. ¡Listo!

El sistema ya está funcionando. A partir de ahora:
- Solo se podrá acceder a las páginas que estén en la lista blanca
- El sistema se actualiza automáticamente cada 5 minutos
- Si reinicias el ordenador, el sistema seguirá activo

## Gestionar la lista de páginas permitidas

La lista de páginas web permitidas se encuentra en un archivo en internet (GitHub Gist). Para modificarla:

### Opción 1: Editar directamente en GitHub (Recomendado)

1. Ve a: https://gist.github.com/balejosg/9a81340e7e7bfd044cc031f41af6acdc
2. Inicia sesión con tu cuenta de GitHub
3. Haz clic en **"Edit"** (Editar)
4. Añade o quita páginas web, una por línea. Por ejemplo:
   ```
   wikipedia.org
   google.com
   educamadrid.org
   ```
5. Haz clic en **"Update public gist"** (Actualizar)
6. Espera 5 minutos y los ordenadores descargarán la nueva lista automáticamente

### Opción 2: Desde el ordenador

También puedes ver la lista descargada actualmente en el ordenador:

```bash
cat /var/lib/url-whitelist/whitelist.txt
```

## 🚨 Desactivar el sistema remotamente (DESACTIVACIÓN DE EMERGENCIA)

**IMPORTANTE:** Existe una manera muy fácil de desactivar todos los ordenadores simultáneamente sin necesidad de acceder a cada uno.

### ¿Cuándo usar esto?

- Clase especial donde necesites acceso libre a internet
- Eventos o actividades que requieran navegación sin restricciones
- Emergencias donde el bloqueo esté causando problemas
- Mantenimiento temporal del sistema

### Cómo desactivar (Método simple)

1. Ve al Gist de la whitelist: https://gist.github.com/balejosg/9a81340e7e7bfd044cc031f41af6acdc
2. Haz clic en **"Edit"** (Editar)
3. **Añade esta línea al principio del archivo:**
   ```
   # DESACTIVADO
   ```
4. Haz clic en **"Update public gist"** (Actualizar)
5. Espera **máximo 5 minutos** (o menos si ejecutas el comando de actualización manual)

**Resultado:** Todos los ordenadores que usen este sistema permitirán acceso libre a internet.

### Ejemplo de archivo desactivado

```
# DESACTIVADO
# El sistema está desactivado mientras esta línea esté presente
# (Puedes dejar el resto de la lista intacta)
wikipedia.org
google.com
educamadrid.org
```

### Cómo reactivar

1. Edita el Gist nuevamente
2. **Elimina o comenta** la línea `# DESACTIVADO`
3. Actualiza el Gist
4. En máximo 5 minutos, el sistema volverá a aplicar restricciones

### Ejemplo de archivo reactivado

```
# El sistema está activo de nuevo
wikipedia.org
google.com
educamadrid.org
```

### Variantes que funcionan

El sistema detecta cualquiera de estas variantes (no distingue mayúsculas/minúsculas):

- `# DESACTIVADO`
- `# desactivado`
- `#DESACTIVADO`
- `# Sistema desactivado`
- `# DESACTIVADO temporalmente`

**Lo importante:** La palabra "DESACTIVADO" debe estar en un comentario (línea que empieza con `#`) y debe ser la primera línea no vacía del archivo.

### Forzar actualización inmediata

Si necesitas que la desactivación/reactivación sea inmediata (sin esperar 5 minutos), ejecuta esto en cada ordenador:

```bash
sudo /usr/local/bin/dnsmasq-whitelist.sh
```

### Verificar estado

Para verificar si un ordenador detectó la desactivación, revisa los logs:

```bash
sudo tail -n 20 /var/log/url-whitelist.log
```

Si está desactivado, verás un mensaje como:
```
DESACTIVACIÓN REMOTA DETECTADA en whitelist
=== SISTEMA DESACTIVADO REMOTAMENTE - Eliminando restricciones ===
```

## Páginas que siempre están permitidas

Aunque no las añadas a la lista, estas páginas siempre estarán accesibles (son necesarias para el funcionamiento del sistema):

- google.es (búsquedas básicas)
- github.com, gist.githubusercontent.com (para descargar la lista)
- nce.wedu.comunidad.madrid, max.educa.madrid.org (plataformas educativas de Madrid)
- archive.ubuntu.com, security.ubuntu.com (actualizaciones del sistema)
- anthropic.com, claude.ai (herramientas de IA educativas)

## Comandos útiles

Estos comandos pueden ayudarte a verificar que todo funciona correctamente. Ábrelos en una **Terminal**:

### Ver si el sistema está activo

```bash
sudo systemctl status dnsmasq-whitelist.timer
```

Si ves "active (running)" en verde, está funcionando.

### Ver los mensajes del sistema (logs)

```bash
sudo tail -f /var/log/url-whitelist.log
```

Aquí verás cuando descarga la lista, si hay errores, etc. Presiona `Ctrl+C` para salir.

### Forzar actualización inmediata

Si has cambiado la lista y quieres que se aplique inmediatamente (sin esperar 5 minutos):

```bash
sudo /usr/local/bin/dnsmasq-whitelist.sh
```

### Ver qué páginas están permitidas ahora mismo

```bash
cat /var/lib/url-whitelist/whitelist.txt
```

## Desactivar temporalmente el sistema

Hay dos formas de desactivar el sistema:

### Método 1: Desactivación remota (Recomendado)

**Para desactivar TODOS los ordenadores a la vez**, consulta la sección [🚨 Desactivar el sistema remotamente](#-desactivar-el-sistema-remotamente-desactivación-de-emergencia) más arriba.

Este es el método más fácil porque no necesitas acceder físicamente a cada ordenador.

### Método 2: Desactivación local (Solo un ordenador)

Si solo necesitas desactivar UN ordenador específico:

```bash
sudo systemctl stop dnsmasq-whitelist.timer
sudo systemctl stop dnsmasq-whitelist.service
```

Para activarlo de nuevo:

```bash
sudo systemctl start dnsmasq-whitelist.timer
```

**Nota:** Este método solo afecta al ordenador donde ejecutes el comando. Los demás seguirán con las restricciones activas.

## Desinstalar completamente

Si quieres eliminar el sistema por completo:

```bash
sudo ./rollback-dnsmasq-whitelist.sh
```

Este script eliminará todo lo que se instaló y devolverá el ordenador a su estado original.

## Solución de problemas

### "No puedo acceder a ninguna página web"

1. Verifica que el sistema está funcionando:
   ```bash
   sudo systemctl status dnsmasq-whitelist.timer
   ```

2. Comprueba los logs para ver si hay errores:
   ```bash
   sudo tail -n 50 /var/log/url-whitelist.log
   ```

3. Intenta ejecutar manualmente el script:
   ```bash
   sudo /usr/local/bin/dnsmasq-whitelist.sh
   ```

### "Las páginas que añadí no funcionan"

1. Espera al menos 5 minutos después de editar la lista en GitHub
2. Verifica que la página esté escrita correctamente (sin http://, sin www si no es necesario)
3. Fuerza una actualización manual:
   ```bash
   sudo /usr/local/bin/dnsmasq-whitelist.sh
   ```

### "El sistema no se actualiza automáticamente"

Verifica que el timer esté activo:
```bash
sudo systemctl status dnsmasq-whitelist.timer
```

Si no está activo, inícialo:
```bash
sudo systemctl enable --now dnsmasq-whitelist.timer
```

## Información técnica adicional

Para más detalles técnicos sobre cómo funciona el sistema, consulta el archivo [CLAUDE.md](CLAUDE.md) en este repositorio.

## Preguntas frecuentes

### ¿Funciona en Windows o Mac?

No, este sistema solo funciona en ordenadores con Linux (Ubuntu o Debian).

### ¿Afecta a todos los usuarios del ordenador?

Sí, el control de acceso se aplica a todos los usuarios que usen ese ordenador.

### ¿Puedo tener diferentes listas para diferentes ordenadores?

Sí, pero necesitarías crear diferentes archivos de lista (Gists diferentes) y modificar cada ordenador para que use su propia URL.

### ¿Qué pasa si se va internet?

Si el sistema no puede descargar la lista actualizada, **permite el acceso libre** a internet para no interrumpir las actividades. Esto se llama "fail-open" (fallar abierto).

### ¿Se puede saltear este bloqueo?

Un usuario con conocimientos técnicos y permisos de administrador podría desactivarlo. Para ambientes donde se necesite mayor seguridad, se recomienda:
- No dar permisos de administrador a los estudiantes
- Configurar contraseñas fuertes para las cuentas de administrador
- Revisar periódicamente los logs del sistema

## Soporte

Si tienes problemas o preguntas:
1. Revisa la sección "Solución de problemas" arriba
2. Consulta los logs del sistema para ver mensajes de error
3. Abre un "Issue" en GitHub: https://github.com/balejosg/whitelist/issues

## Licencia

Este proyecto es de código abierto y puede ser usado libremente en entornos educativos.

---

**Creado para facilitar la gestión de aulas de informática en entornos educativos.**
