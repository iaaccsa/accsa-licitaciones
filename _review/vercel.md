# Configuración de Vercel para evitar bloqueos desde Azure

## Problema

Los Azure Container Apps Jobs se ejecutan en paralelo (matrix build del pipeline) y,
al finalizar, todos envían peticiones al backend FastAPI en Vercel casi
simultáneamente (callback `API_JOBS_CALLBACK`, eventos `API_EVENTS_PATH`, etc.).
Vercel interpreta este patrón como tráfico sospechoso y puede bloquear las
peticiones con:

- `HTTP 429 Too Many Requests`
- `HTTP 503 Service Unavailable`
- Errores de conexión desde la WAF de Vercel

---

## Soluciones (de menor a mayor esfuerzo)

### Opción 1 — Middleware FastAPI: eximir peticiones autenticadas del rate limiting

Si el backend FastAPI implementa rate limiting propio (o Vercel lo aplica a nivel
de función), la solución más directa es añadir un middleware que permita pasar sin
restricciones cualquier petición con `X-API-Key` válida.

```python
# middleware.py (FastAPI)
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

TRUSTED_API_KEY = os.environ["API_KEY"]

class BypassRateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Las peticiones de los ACA Jobs siempre llevan X-API-Key
        if request.headers.get("X-API-Key") == TRUSTED_API_KEY:
            request.state.skip_rate_limit = True
        return await call_next(request)
```

```python
# main.py (FastAPI app)
app.add_middleware(BypassRateLimitMiddleware)
```

---

### Opción 2 — `vercel.json`: configurar timeouts y headers de confianza

Añadir en el repo del backend FastAPI un `vercel.json` que:

1. Aumente el timeout de las funciones serverless (máx. 300s en Pro).
2. Declare la función como "fluid" para permitir concurrencia dentro de la misma
   instancia (evita cold starts en ráfagas).

```json
{
  "functions": {
    "api/index.py": {
      "maxDuration": 60
    }
  },
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        }
      ]
    }
  ]
}
```

> **Nota:** `maxDuration` requiere plan **Pro** para valores > 10s.
> En Hobby el máximo es 10s.

---

### Opción 3 — Vercel Firewall: allowlist de IPs de Azure (requiere plan Pro)

Vercel Pro y Enterprise incluyen un **Web Application Firewall (WAF)** con reglas
personalizadas. Se pueden crear reglas para permitir sin restricciones el tráfico
proveniente de los rangos IP de Azure Container Apps en `eastus`.

#### Pasos

1. Ir a **Vercel Dashboard → tu proyecto → Settings → Firewall**.
2. Crear una regla de tipo **IP Allow**:
   - **Condición:** `ip.src in {<rango-IP-Azure>}`
   - **Acción:** Allow (sin inspección WAF)
3. Los rangos IP de Azure para `eastus` se obtienen del archivo oficial:
   ```
   https://www.microsoft.com/en-us/download/details.aspx?id=56519
   ```
   Buscar el tag `AzureContainerApps.EastUS` en el JSON descargado.

> **Limitación:** Azure Container Apps Jobs en modo Manual **no tienen IPs estáticas**
> por defecto. Usan IPs efímeras del pool de Azure. Para fijar las IPs de salida
> es necesario configurar un **NAT Gateway** o **User Defined Routes** en la
> Azure Container Apps Environment.

---

### Opción 4 — NAT Gateway en Azure: IP de salida fija (recomendado a largo plazo)

Configurar una IP pública fija para los Container Apps Jobs, lo que permite
agregarla al allowlist de Vercel de forma permanente.

#### Pasos en Azure

```bash
# 1. Crear una IP pública estática
az network public-ip create \
  --name pip-licitaciones-egress \
  --resource-group accsa-licitaciones \
  --sku Standard \
  --allocation-method Static \
  --location eastus

# 2. Crear un NAT Gateway
az network nat gateway create \
  --name natgw-licitaciones \
  --resource-group accsa-licitaciones \
  --public-ip-addresses pip-licitaciones-egress \
  --location eastus

# 3. Asociar el NAT Gateway a la subnet del ACA Environment
# (requiere conocer el nombre de la VNet/subnet del env-licitaciones)
az network vnet subnet update \
  --name <SUBNET_NAME> \
  --vnet-name <VNET_NAME> \
  --resource-group accsa-licitaciones \
  --nat-gateway natgw-licitaciones
```

Una vez configurado, todos los Container Apps Jobs saldrán siempre desde la misma
IP pública. Agregar esa IP al allowlist de Vercel Firewall.

---

### Opción 5 — Mover el backend a Azure (elimina el problema)

Si el backend FastAPI se despliega en **Azure Container Apps** o **Azure App
Service** dentro de la misma red virtual, las peticiones de los Jobs nunca salen
a internet y no hay rate limiting de Vercel.

---

## Solución aplicada en los servicios (retry con backoff)

Como medida inmediata, todos los servicios implementan retry automático con
backoff exponencial en `supabase_logger.py::make_session()`:

| Parámetro | Valor |
|-----------|-------|
| Reintentos | 3 |
| Backoff factor | 2 (espera 2s, 4s, 8s) |
| Status que disparan retry | 429, 500, 502, 503, 504 |
| Métodos | GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS |

Esto cubre la mayoría de los casos de rate limiting transitorio sin requerir
cambios en la infraestructura.

---

## Recomendación

| Plazo | Acción |
|-------|--------|
| Inmediato | Retry con backoff ya implementado en todos los servicios ✓ |
| Corto plazo | Middleware FastAPI para eximir peticiones con `X-API-Key` (Opción 1) |
| Mediano plazo | NAT Gateway en Azure + Vercel Firewall allowlist (Opciones 3+4) |
| Largo plazo | Migrar backend a Azure para eliminar el problema de raíz (Opción 5) |
