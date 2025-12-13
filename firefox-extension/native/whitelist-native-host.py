#!/usr/bin/env python3
"""
Native Messaging Host para Monitor de Bloqueos de Red

Este script actúa como puente entre la extensión de Firefox y el sistema
de whitelist. Recibe solicitudes de la extensión y ejecuta comandos del
sistema para verificar o añadir dominios.

Instalación:
  1. Copiar a /usr/local/bin/whitelist-native-host.py
  2. Hacer ejecutable: chmod +x /usr/local/bin/whitelist-native-host.py
  3. Registrar el manifest en Firefox

Protocolo:
  - Recibe: JSON con estructura {"action": "...", "domains": [...]}
  - Envía: JSON con estructura {"success": bool, "results": [...]}
"""

import sys
import json
import struct
import subprocess
import os

# Constantes
WHITELIST_CMD = "/usr/local/bin/whitelist"
MAX_DOMAINS = 50  # Límite de dominios por solicitud

def log_debug(message):
    """Escribe logs de debug al archivo de log del sistema"""
    try:
        with open("/var/log/whitelist-native-host.log", "a") as f:
            f.write(f"{message}\n")
    except:
        pass

def read_message():
    """Lee un mensaje del stdin en formato Native Messaging"""
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        return None
    
    message_length = struct.unpack('@I', raw_length)[0]
    
    # Límite de seguridad: max 1MB
    if message_length > 1024 * 1024:
        return None
    
    message = sys.stdin.buffer.read(message_length).decode('utf-8')
    return json.loads(message)

def send_message(message):
    """Envía un mensaje al stdout en formato Native Messaging"""
    encoded_message = json.dumps(message).encode('utf-8')
    encoded_length = struct.pack('@I', len(encoded_message))
    
    sys.stdout.buffer.write(encoded_length)
    sys.stdout.buffer.write(encoded_message)
    sys.stdout.buffer.flush()

def check_domain(domain):
    """
    Verifica si un dominio está en la whitelist y si resuelve.
    
    Returns:
        dict: {
            "domain": str,
            "in_whitelist": bool,
            "resolves": bool,
            "resolved_ip": str or None
        }
    """
    result = {
        "domain": domain,
        "in_whitelist": False,
        "resolves": False,
        "resolved_ip": None
    }
    
    try:
        # Ejecutar whitelist check
        proc = subprocess.run(
            [WHITELIST_CMD, "check", domain],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        output = proc.stdout
        
        # Parsear resultado
        if "SÍ" in output or "YES" in output:
            result["in_whitelist"] = True
        
        if "→" in output:
            result["resolves"] = True
            # Extraer IP
            import re
            ip_match = re.search(r'→\s*(\S+)', output)
            if ip_match:
                result["resolved_ip"] = ip_match.group(1)
        
    except subprocess.TimeoutExpired:
        log_debug(f"Timeout checking domain: {domain}")
    except Exception as e:
        log_debug(f"Error checking domain {domain}: {e}")
    
    return result

def check_domains(domains):
    """Verifica múltiples dominios"""
    results = []
    
    # Limitar cantidad de dominios
    domains = domains[:MAX_DOMAINS]
    
    for domain in domains:
        # Validación básica del dominio
        if not domain or not isinstance(domain, str):
            continue
        
        # Sanitizar: solo permitir caracteres válidos para dominios
        domain = domain.strip().lower()
        if not all(c.isalnum() or c in '.-' for c in domain):
            continue
        
        result = check_domain(domain)
        results.append(result)
    
    return results

def get_whitelist_domains():
    """Obtiene la lista de dominios en la whitelist"""
    try:
        proc = subprocess.run(
            [WHITELIST_CMD, "domains"],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        domains = [d.strip() for d in proc.stdout.split('\n') if d.strip()]
        return domains
        
    except Exception as e:
        log_debug(f"Error getting domains: {e}")
        return []

def get_system_status():
    """Obtiene el estado del sistema whitelist"""
    try:
        proc = subprocess.run(
            [WHITELIST_CMD, "status"],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        return {
            "output": proc.stdout,
            "active": "activo" in proc.stdout.lower() or "active" in proc.stdout.lower()
        }
        
    except Exception as e:
        log_debug(f"Error getting status: {e}")
        return {"output": "", "active": False}

def handle_message(message):
    """Procesa un mensaje y devuelve la respuesta"""
    
    if not isinstance(message, dict):
        return {"success": False, "error": "Invalid message format"}
    
    action = message.get("action", "")
    
    if action == "check":
        domains = message.get("domains", [])
        if not domains:
            return {"success": False, "error": "No domains provided"}
        
        results = check_domains(domains)
        return {
            "success": True,
            "action": "check",
            "results": results
        }
    
    elif action == "list":
        domains = get_whitelist_domains()
        return {
            "success": True,
            "action": "list",
            "domains": domains
        }
    
    elif action == "status":
        status = get_system_status()
        return {
            "success": True,
            "action": "status",
            "status": status
        }
    
    elif action == "ping":
        return {
            "success": True,
            "action": "ping",
            "message": "pong"
        }
    
    else:
        return {
            "success": False,
            "error": f"Unknown action: {action}"
        }

def main():
    """Bucle principal de procesamiento de mensajes"""
    log_debug("Native host started")
    
    while True:
        message = read_message()
        
        if message is None:
            log_debug("No message received, exiting")
            break
        
        log_debug(f"Received: {message}")
        
        response = handle_message(message)
        
        log_debug(f"Sending: {response}")
        send_message(response)

if __name__ == "__main__":
    main()
