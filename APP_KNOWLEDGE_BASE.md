# 📋 DOSSIER COMPLETO: APLICACIÓN DE CONTROL DE PRODUCCIÓN (L.I.A.R KPI)

Este documento recopila todo el conocimiento técnico, funcional y de negocio de la aplicación actual, así como la hoja de ruta y propuesta de arquitectura para su evolución hacia un sistema **multilínea**, **multiusuario** y **en tiempo real con Supabase**.

---

## 1. Resumen Ejecutivo y Propósito del Sistema

La aplicación es un **MES (Manufacturing Execution System) / Dashboard de Control de Producción Industrial** especializado en plantas de envasado de ensaladas de cuarta gama (ej. Florette / Vegaindus).

### Objetivos Principales:
1. Configurar y ordenar la **cola de órdenes de fabricación (OFs)** y ensaladas.
2. Controlar en tiempo real el **envasado de cajas, palets, picos y pedidos especiales (*Noblejas*)**.
3. Garantizar la **trazabilidad del lote**, fechas de caducidad y cambios de formato/caja.
4. Mostrar métricas de rendimiento en planta (ritmo de cajas/minuto, hora estimada, visualización en pantallas de planta).

---

## 2. Stack Tecnológico Actual

* **Framework:** Next.js 16 (App Router) + React 19 con TypeScript estricto.
* **Estilos:** Tailwind CSS v4, Lucide React, componentes Base-UI/Radix UI (`src/components/ui`).
* **Gestión de Estado:** Zustand v5 con middleware `persist` en `localStorage` (`salad-production-storage`).
* **Audio y Táctil:** Web Audio API sintético para feedback sonoro industrial (clics táctiles y fanfarrias de completado) y vibración háptica (`navigator.vibrate`).
* **Despliegue actual:** Compatible con Vercel.

---

## 3. Modelo de Datos y Lógica de Negocio

### A. Tipos de Cajas Predefinidas (`DEFAULT_BOX_TYPES`)
* **Cartón 4:** 72 cajas/palet, 4 ensaladas/caja
* **Cartón 6:** 72 cajas/palet, 6 ensaladas/caja
* **LL410 4:** 64 cajas/palet, 4 ensaladas/caja
* **LL6410 6:** 64 cajas/palet, 6 ensaladas/caja
* **PV216 12:** 36 cajas/palet, 12 ensaladas/caja
* **PV136 6:** 64 cajas/palet, 6 ensaladas/caja

### B. Estructura de Datos Central (`types.ts`)

#### `Salad` / `Format`:
* `id`, `name`: Nombre de la ensalada (ej. "Ensalada César", "Promo Mezclum").
* `boxType`: Tipo de caja asignada.
* `quantity`: Total de cajas requeridas en la orden.
* `noblejas`: Cajas dedicadas al cliente/destino *Noblejas* (se restan del total para obtener la producción estándar *Milagro*).
* `boxesPerPallet`: Capacidad de cajas por palet.
* `lote`, `cambioLote`, `fechaCaducidad`, `linea`, `note`: Trazabilidad y alertas operativas.

#### `QueueItem` (Cola de Producción):
Representa cada formato desglosado secuencialmente en la cola de trabajo activa.

#### `FormatProgress` (Estado de Progreso en Vivo):
* `completedPallets`: Palets estándar completados.
* `picoCompleted`: Indicador booleano de pico estándar verificado.
* `noblejasCompletedPallets` & `nobjelasPicoCompleted`: Progreso interactivo de Noblejas.
* `boxesAdjustment`: Ajuste manual express de cajas (`+1`, `-1`, etc.).
* `palletLastUpdated`, `lastPalletTimestamp`, `lastPalletIntervalMs`: Marcas de tiempo para cálculo del ritmo de paletizado (cajas/minuto).

### C. Matemática de Producción (`calculateFormat`)

$$\text{Producción Estándar (Milagro)} = \text{Cantidad Total} - \text{Noblejas}$$
$$\text{Palets Completos} = \lfloor \text{Producción} / \text{CajasPorPalet} \rfloor$$
$$\text{Pico (Cajas Sueltas)} = \text{Producción} \pmod{\text{CajasPorPalet}}$$

*(La misma descomposición aplica para las cajas destinadas a Noblejas).*

### D. Trazabilidad Semanal por Color de Etiqueta (`DAY_LABEL_COLORS`)
* **Lunes:** Roja
* **Martes:** Azul
* **Miércoles:** Rosa
* **Jueves:** Naranja
* **Viernes:** Blanca
* **Sábado:** Verde
* **Domingo:** Gris

Identificación instantánea del día de envasado en la cabecera y en el panel de trazabilidad.

---

## 4. Mapa de Componentes y Funcionalidades Existentes

### 1. Panel de Control y Ejecución (`ProductionCard.tsx`)
* **Pirámide de Métricas:** Cúspide con total de cajas y unidades totales; bloques de palets/pico para Noblejas y Milagro.
* **Secuencia de Extracción en Acordeón:** Pasos guiados y ordenados:
  1. *Palets Noblejas* (rejilla interactiva botón a botón).
  2. *Pico Noblejas* (botón de verificación con checkbox táctil).
  3. *Palets Milagro* (rejilla interactiva palet a palet).
  4. *Pico Milagro* (botón de verificación).
* **Gráfico de Ritmo en Vivo (`PerformanceChart`):** Polilínea SVG con efecto neón que grafica la velocidad instantánea de envasado en cajas/minuto.
* **Popover de Detalles:** Muestra en tiempo real unidades totales por caja, por palet y factores de conversión.

### 2. Cabecera Activa (`ProductionHeader.tsx`)
* Indicador de transición con código de colores según el próximo cambio (Cambio de Ensalada, Cambio de Caja, Cambio de Lote o Mismo Formato).
* Visualizador del formato siguiente: `SIGUIENTE → [Ensalada] [Caja] [Cajas] (Palets + Pico)`.
* Reloj de planta sincronizado en el título de la pestaña del navegador (`useTabClock.ts`).
* Botón de tema (Florette verde vs. Premium Gold dorado).
* Navegación manual entre formatos (`◀ Ant.` / `Sig. ▶`).

### 3. Modales y Herramientas Operativas
* **`SaladForm.tsx`:** Modal completo para crear/editar ensaladas con múltiples formatos simultáneos.
* **`EditQueueItemDialog.tsx`:** Edición al vuelo de cualquier orden en la cola (ajuste de cajas, cambio de lote, notas y alertas).
* **`ProductionQueue.tsx`:** Lista colapsable de la cola con reordenación mediante botones táctiles, contador de hechos vs. pendientes y salto directo.
* **`Calculator.tsx`:** Calculadora industrial integrada para conversiones rápidas de cajas/palets.
* **`ScreenLockOverlay.tsx`:** Bloqueo táctil de pantalla (*Glove-Lock*) para evitar pulsaciones accidentales con guantes o salpicaduras.
* **`TransitionBanner.tsx`:** Banner gigante a pantalla completa visible a 10 metros al cambiar de OF/lote/caja con cuenta atrás de 2.5s.
* **Split View con Iframe:** Panel dividido ajustable para incrustar portales web internos de la fábrica (ej. portal industrial Vegaindus) con marcadores configurables.
* **Historial y Favoritos (`Templates`):** Guarda las últimas 30 OFs terminadas con tiempo de duración y permite guardar plantillas de pedidos frecuentes.

---

## 5. Diagnóstico de la Limitación Actual vs. Nuevo Enfoque

### El problema actual:
> Actualmente, **toda la información se almacena únicamente en el `localStorage` del navegador donde se está usando**. Si el ordenador de la Línea K01 suma 3 palets, el ordenador del supervisor o de la Línea K00 no se entera porque no existe una base de datos centralizada ni conexión de red.

### El nuevo objetivo:
1. **Multilínea:** Soporte para varias líneas físicas simultáneas (ej. `K00`, `K01`, `K02`, `K03`).
2. **Acceso Concurrente:** Poder ver desde la oficina o desde cualquier tablet qué ensalada se está haciendo en cada línea, cuántas cajas van, cuántos palets faltan y el estado del lote.
3. **Tiempo Real (Realtime WebSockets):** Cualquier clic en una pantalla debe reflejarse instantáneamente en las demás pantallas sin necesidad de refrescar la página (`F5`).
4. **Multiusuario y Permisos:**
   * **Operario de Línea:** Controla la cola y suma palets de su línea asignada.
   * **Supervisor / Oficina:** Visualiza todas las líneas en un panel resumen (Multi-Line Dashboard), puede añadir pedidos a las colas y cambiar prioridades.
   * **Calidad / Admin:** Gestiona lotes, colores de etiquetas y auditorías.

---

## 6. Arquitectura Propuesta con Supabase

### ¿Por qué Supabase?
1. **PostgreSQL Relacional:** Estructura perfecta para líneas, ensaladas, formatos, colas e histórico de producción.
2. **Supabase Realtime (WebSockets nativos):** Permite suscribir la app a cambios en la base de datos (`postgres_changes`). Cuando la tablet de K01 marca un palet, Supabase emite un evento WebSocket y Zustand/React actualiza el estado en todas las pantallas en menos de 50ms.
3. **Autenticación y Row Level Security (RLS):** Permite login por usuario, asignación de rol (operario, supervisor) y línea por defecto.
4. **Hosting Serverless en Vercel:** Supabase funciona vía HTTPS y WebSockets mediante `@supabase/supabase-js`, sin necesidad de mantener un servidor Node.js/Express dedicado.

---

## 7. Script SQL para Supabase

```sql
-- 1. Líneas de producción (K00, K01, K02, K03, etc.)
CREATE TABLE production_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- 'K00', 'K01', 'K02', 'K03'
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  current_queue_index INT DEFAULT 0,
  is_producing BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Cola de producción por línea
CREATE TABLE line_queue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id UUID REFERENCES production_lines(id) ON DELETE CASCADE,
  order_index INT NOT NULL,
  salad_name TEXT NOT NULL,
  box_type TEXT NOT NULL,
  quantity INT NOT NULL,
  noblejas INT DEFAULT 0,
  boxes_per_pallet INT NOT NULL,
  note TEXT,
  lote TEXT,
  cambio_lote BOOLEAN DEFAULT false,
  fecha_caducidad TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Progreso en vivo de cada item de la cola
CREATE TABLE queue_item_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_item_id UUID UNIQUE REFERENCES line_queue_items(id) ON DELETE CASCADE,
  completed_pallets INT DEFAULT 0,
  pico_completed BOOLEAN DEFAULT false,
  noblejas_completed_pallets INT DEFAULT 0,
  noblejas_pico_completed BOOLEAN DEFAULT false,
  boxes_adjustment INT DEFAULT 0,
  finished BOOLEAN DEFAULT false,
  format_start_time TIMESTAMPTZ,
  pallet_last_updated TIMESTAMPTZ,
  last_pallet_interval_ms INT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Historial de producción para reportes y trazabilidad
CREATE TABLE production_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id UUID REFERENCES production_lines(id),
  salad_name TEXT NOT NULL,
  box_type TEXT NOT NULL,
  quantity INT NOT NULL,
  noblejas INT DEFAULT 0,
  boxes_per_pallet INT NOT NULL,
  lote TEXT,
  duration_seconds INT,
  finished_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar publicaciones en tiempo real para las tablas clave
ALTER PUBLICATION supabase_realtime ADD TABLE production_lines;
ALTER PUBLICATION supabase_realtime ADD TABLE line_queue_items;
ALTER PUBLICATION supabase_realtime ADD TABLE queue_item_progress;
```

---

## 8. Prompt y Guía para Tu IA

```markdown
Actúa como Arquitecto Senior de Software y Desarrollador Full-Stack experto en React 19, Next.js (App Router), TypeScript, Zustand y Supabase.

### CONTEXTO DEL PROYECTO:
Tenemos una aplicación web industrial en funcionamiento llamada "Salad Product Production" (MES / Dashboard de Planta). 
Actualmente funciona como SPA local con Zustand persistido en localStorage. Su función es controlar el envasado en planta de ensaladas: cajas totales, pedidos a Noblejas, producción estándar Milagro, desglose en palets y picos, control de lote/caducidad, gráfico de velocidad de paletizado en cajas/minuto y modo TV/Ambiente.

### ARQUITECTURA ACTUAL DE LA APP:
- Types principales: `Salad`, `Format`, `QueueItem`, `FormatProgress` (palets completados, picos verificados, noblejas interactivas, ajustes express).
- Componentes clave: `ProductionCard` (métricas, secuencia de extracción con palets clickables y gráfico SVG), `ProductionHeader` (transición de lote/caja, reloj sincronizado, selector de tema Florette/Gold), `SaladForm`, `ProductionQueue`, `EditQueueItemDialog`, `FinishFormatDialog`, `Calculator`, `ScreenLockOverlay` y `TransitionBanner`.
- Tipos de caja: Cartón 4 (72 c/p), Cartón 6 (72 c/p), LL6410 4 (64 c/p), LL6410 6 (64 c/p), PV216 12 (36 c/p), PV136 6 (64 c/p).

### NUEVO OBJETIVO A IMPLEMENTAR:
1. Migrar el almacenamiento de local (`localStorage`) a backend con **Supabase (PostgreSQL + Supabase Realtime)**.
2. Soporte **Multilínea**: La fábrica tiene varias líneas (ej. K00, K01, K02, K03). Se debe poder seleccionar la línea a operar o abrir un panel "Vista General de Planta" donde se vean todas las líneas activas en tiempo real.
3. Sincronización en tiempo real bidireccional mediante suscripciones WebSockets de Supabase (`supabase.channel().on('postgres_changes', ...)`).
4. Soporte multiusuario con roles (Operario de línea, Supervisor, Admin).
5. Mantener la misma interfaz visual, rica experiencia táctil y animaciones que ya existen.

Por favor, genera el plan de implementación paso a paso, el script SQL de creación de tablas en Supabase con RLS, y la capa de integración cliente (`lib/supabase.ts` y hook/store sincronizado).
```
