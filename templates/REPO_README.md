# URL Whitelist - Centro Educativo

Este repositorio contiene la lista oficial de URLs permitidas en los equipos del centro educativo.

## 📋 Descripción

El archivo `whitelist.txt` define qué dominios pueden ser accedidos desde los equipos con el sistema de filtrado dnsmasq instalado. Este sistema:

- ✅ Permite acceso SOLO a dominios en esta lista
- 🚫 Bloquea todos los demás dominios (retorna NXDOMAIN)
- 🔄 Se sincroniza automáticamente cada 5 minutos en todos los equipos
- 🛡️ Incluye protección contra bypass (VPN, DNS alternativo, Tor)

## 📝 Formato del Archivo

```text
# Comentarios empiezan con #
# Una URL por línea (solo dominio base, sin www ni https://)

# Ejemplo - Búsqueda
google.com
bing.com

# Ejemplo - Educación
educamadrid.org
moodle.educa.madrid.org

# Ejemplo - Recursos educativos
wikipedia.org
khanacademy.org
```

### ⚠️ Importante

- **Solo dominios base**: `google.com` permite automáticamente `www.google.com`, `mail.google.com`, etc.
- **Sin protocolos**: NO usar `https://` o `http://`
- **Sin rutas**: NO usar `/path/to/resource`
- **Sin www**: El sistema resuelve todos los subdominios automáticamente

## ✏️ Cómo Editar el Whitelist

### Opción 1: Editar en la Web (Recomendado)

1. Ir a: https://github.com/TU-ORGANIZACION/url-whitelist
2. Clic en `whitelist.txt`
3. Clic en el icono del lápiz (✏️) arriba a la derecha
4. Hacer cambios
5. Scroll hacia abajo → Describir el cambio en "Commit message"
6. Clic en "Commit changes"

**Los cambios se aplicarán en todos los equipos en máximo 5 minutos.**

### Opción 2: Usando Git (Avanzado)

```bash
# Clonar repositorio
git clone https://github.com/TU-ORGANIZACION/url-whitelist.git
cd url-whitelist

# Editar archivo
nano whitelist.txt

# Guardar cambios
git add whitelist.txt
git commit -m "Agregar/quitar dominio X"
git push origin main
```

## 🚨 Desactivación de Emergencia

Para desactivar TEMPORALMENTE el whitelist en TODOS los equipos simultáneamente:

1. Editar `whitelist.txt`
2. Agregar como PRIMERA línea (antes de cualquier otra cosa):
```text
# DESACTIVADO
```
3. Guardar cambios

**Esto desactivará el filtrado en todos los equipos en máximo 5 minutos.**

Para reactivar, simplemente eliminar esa línea.

## 👥 Administradores

Ver [OWNERS.md](OWNERS.md) para la lista completa de personas con permisos de edición.

## 📚 Ejemplos de Dominios Comunes

### Búsqueda y Productividad
```
google.com
bing.com
duckduckgo.com
```

### Educación Madrid
```
educamadrid.org
educa.madrid.org
nce.wedu.comunidad.madrid
max.educa.madrid.org
```

### Recursos Educativos
```
wikipedia.org
khanacademy.org
edpuzzle.com
quizlet.com
kahoot.com
```

### Comunicación Educativa
```
teams.microsoft.com
zoom.us
meet.google.com
```

### Desarrollo y Programación
```
github.com
stackoverflow.com
w3schools.com
```

### Herramientas Cloud
```
drive.google.com
onedrive.live.com
dropbox.com
```

## 🔧 Solución de Problemas

### "No puedo acceder a un sitio que debería estar permitido"

1. Verificar que el dominio BASE está en `whitelist.txt`
   - Ejemplo: Si `www.ejemplo.com` no funciona, verificar que `ejemplo.com` está en la lista
2. Esperar 5 minutos (tiempo máximo de sincronización)
3. Si persiste, contactar a administradores

### "Quiero agregar un dominio pero no tengo permisos"

Contactar a cualquiera de los administradores listados en [OWNERS.md](OWNERS.md) con:
- Dominio a agregar
- Justificación educativa
- Asignatura/departamento que lo solicita

## 📖 Documentación Técnica

Para información técnica del sistema completo:
- [Repositorio principal del sistema](https://github.com/balejosg/whitelist)
- [Documentación técnica (CLAUDE.md)](https://github.com/balejosg/whitelist/blob/main/CLAUDE.md)

## 🆘 Soporte

**Contacto IT del Centro:**
- Email: it@tucolegio.edu
- Teléfono: XXX-XXX-XXX
- Horario: L-V 8:00-16:00

---

📅 **Última actualización**: [Fecha]
🏫 **Centro**: [Nombre del Centro Educativo]
🔗 **URL Raw** (para scripts): `https://raw.githubusercontent.com/TU-ORGANIZACION/url-whitelist/main/whitelist.txt`
