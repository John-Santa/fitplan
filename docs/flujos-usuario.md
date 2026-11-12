# MagniFit: flujos de usuario final

Inventario de los flujos que importan a quien usa la app, con su estado actual y el detalle de los que faltan o están incompletos. Fecha: 2026-11-12. Fuente: auditoría de solo lectura sobre `web/`, `api/` y `deploy/`; cada estado cita el archivo que lo respalda.

## Cómo leer este documento

- **Completo**: el usuario puede terminar el flujo hoy.
- **Parcial**: funciona, pero le falta una parte que el usuario va a notar.
- **Falta**: un usuario real lo va a necesitar y no existe.
- Prioridad: **P0** bloquea a usuarios reales o puede perder datos, **P1** afecta el uso normal, **P2** es pulido.
- Tamaño: **S** (un día o menos), **M** (varios días), **L** (más de una semana).

## Contexto técnico

La API expone solo `GET /health`, `GET /readyz`, `GET /v1/me` y `GET|POST /v1/sync` (`api/internal/adapter/httpapi/router.go`, `api/openapi.yaml`). Todos los flujos leen y escriben primero en IndexedDB; con Clerk configurado, cada escritura pasa además por una cola de salida y se sincroniza con `/v1/sync` (`web/src/lib/store.tsx:105-129`, `web/src/features/sync/lib/localWrites.ts:22-73`).

La sincronización en sí está construida. Lo que falta está alrededor: bienvenida, ciclo de vida de la cuenta, conflictos, borrado y la mudanza de usuarios entre dominios.

No se pudo verificar desde el repositorio:

- Si producción ya tiene la clave de Clerk configurada (la tarea de despliegue T7 sigue abierta en `odd/tasks/magnifit-backend.md`).
- La configuración del panel de Clerk: verificación de correo, recuperación de contraseña, borrado de cuenta por el usuario.

## Resumen por prioridad

| Prioridad | Flujo | Estado | Tamaño | Por qué |
|---|---|---|---|---|
| P0 | F33 Mudanza de GitHub Pages a app.magnifit.co | Falta | S | Único camino donde un usuario actual pierde todo su historial |
| P0 | F1 Bienvenida y configuración inicial | Falta | L | Todo usuario nuevo arranca con los datos corporales, metas y plan del dueño |
| P0 | F19 Crear cuenta e iniciar sesión | Parcial | S | La cuenta solo se alcanza desde Perfil y depende de configurar producción |
| P0 | F30 Eliminar cuenta y datos en la nube | Falta | M | Con cuentas activas, el usuario no puede borrar sus datos de salud |
| P1 | F21 Cerrar sesión y cambiar de cuenta | Parcial | M | Los datos del usuario anterior quedan en el dispositivo |
| P1 | F26 Conflictos entre dispositivos | Parcial | M–L | Registros de hábito y metas se pierden en silencio |
| P1 | F23 Sesión expirada | Parcial | S | La sincronización se detiene tras un error genérico |
| P1 | F8 Fin de bloque de 12 semanas | Parcial | M | Todo usuario llega ahí a las 12 semanas |
| P1 | F7 Editar una sesión terminada | Parcial | M | Un peso mal digitado no se puede corregir |
| P2 | F16 Instalación, actualización e indicador de estado | Parcial | S–M | Confianza y pulido |
| P2 | F14 Respaldo robusto y borrado completo | Parcial | S | Fallos poco frecuentes |
| P2 | F28 Cambios rechazados por el servidor | Parcial | S | Poco frecuente |
| P2 | F29 Recordatorios de entrenamiento | Falta | M | Capacidad nueva; no está en las especificaciones |
| P2 | F11 Calentamiento editable | Decisión abierta | — | Espera una decisión de producto |

## Inventario completo

| # | Flujo | Estado | Evidencia |
|---|---|---|---|
| 1 | Bienvenida y configuración inicial | Falta | `web/src/lib/store.tsx:79-82`, `web/src/lib/plan.ts:165-201` siembran los datos del dueño; no hay código de bienvenida |
| 2 | Pantalla Hoy (rutina siguiente, racha, registro) | Completo | `web/src/features/today/routes/Home.tsx:244-331` |
| 3 | Vista semanal flexible | Completo | `Home.tsx:385-402` |
| 4 | Sesión de fuerza (calentamiento, cronómetros, dolor, descanso) | Completo | `web/src/features/session/routes/Train.tsx:50-68`, `session/lib/activeSession.ts` |
| 5 | Sesión mínima de "día difícil" | Completo | `Home.tsx:279` |
| 6 | Sesión de natación | Completo | `Train.tsx:245`, `session/components/SwimBody.tsx` |
| 7 | Historial y detalle de sesión | Parcial | `Train.tsx:77-175`: se puede eliminar, no editar |
| 8 | Progresión de 12 semanas y gráficas | Parcial | `web/src/lib/phases.ts:8-17`: después de la semana 12 no pasa nada |
| 9 | Medidas corporales y gráficas | Completo | `web/src/features/progress/routes/Measure.tsx:22-183` |
| 10 | Hábitos e intenciones de implementación | Completo | `web/src/features/habit/routes/Habit.tsx:52-62` |
| 11 | Editor del plan | Completo, salvo el calentamiento | `web/src/features/plan/routes/PlanEditor.tsx`; `odd/tasks/editable-plan.md:51` |
| 12 | Ficha de ejercicio y Guía | Completo | `odd/tasks/editable-plan.md:31-35` |
| 13 | Ajustes (altura, fechas, piscina, metas) | Completo | `web/src/features/account/routes/Settings.tsx:175-229` |
| 14 | Exportar y restaurar respaldo local | Parcial | `odd/tasks/editable-plan.md:57`: la restauración no es atómica |
| 15 | Borrar todos los datos | Parcial | `web/src/lib/db.ts:277-284` no borra el borrador de sesión activa |
| 16 | PWA: sin conexión, instalación, actualización | Parcial | `web/vite.config.ts`: sin aviso de instalación ni de versión nueva |
| 17 | Diseño de escritorio | Completo | `web/src/styles/styles.css:881` |
| 18 | Estados de carga y error de la base local | Completo | `web/src/app/App.tsx:44-56`, `components/ErrorBoundary.tsx` |
| 19 | Crear cuenta e iniciar sesión | Parcial | `account/components/clerkAuth.tsx:41-49`: única entrada en Perfil |
| 20 | Recuperar contraseña y verificar correo | Delegado a Clerk | Sin código en el repositorio; depende del panel de Clerk |
| 21 | Cerrar sesión | Parcial | `sync/lib/localWrites.ts:5-8`: los datos y la cola quedan en el dispositivo |
| 22 | Cambiar de cuenta en un dispositivo | Parcial | `sync/lib/engine.ts:36-38,163-166`: se bloquea y la única salida es borrar |
| 23 | Sesión expirada (401) | Parcial | `engine.ts:186-191,200-206`: error genérico con reintento indefinido |
| 24 | Sincronización, cola sin conexión, reintento | Completo | `engine.ts:140-386`, `sync/lib/useSync.ts:12-38` |
| 25 | Subida de datos locales en el primer inicio de sesión | Completo | `engine.ts:444-504` |
| 26 | Manejo de conflictos | Parcial | `engine.ts:296-311`: gana la última escritura del documento completo |
| 27 | Uso en varios dispositivos | Parcial | `useSync.ts:5,25-30`: sondeo cada 5 minutos o al enfocar |
| 28 | Cambios rechazados por el servidor | Parcial | `sync/lib/statusText.ts:24-27`: muestra un conteo sin acciones |
| 29 | Recordatorios y notificaciones | Falta | Sin uso de la API de notificaciones en `web/src` |
| 30 | Eliminar cuenta | Falta | `router.go`: no hay ruta DELETE ni webhook de Clerk |
| 31 | Borrar datos en la nube y conservar la cuenta | Falta | `statusText.ts:43`: al borrar con sesión iniciada, todo vuelve a descargarse |
| 32 | Exportar datos (portabilidad) | Completo | `db.ts:186`, `Settings.tsx:98-105` |
| 33 | Mudanza de GitHub Pages a app.magnifit.co | Falta | `.github/workflows/deploy.yml`, `deploy/render.yaml:26`; IndexedDB es por origen |
| 34 | Visibilidad del estado de sincronización | Parcial | `Settings.tsx:48`: solo visible en Ajustes |

## Detalle de los flujos por implementar

### F33. Mudanza de GitHub Pages a app.magnifit.co (P0, S, falta)

- **Objetivo**: quien usa hoy la versión de GitHub Pages conserva su historial al pasar al dominio nuevo.
- **Por qué se rompe**: IndexedDB es por origen; los datos no siguen al usuario a otro dominio. La versión de Pages se construye sin clave de Clerk y la API solo acepta `app.magnifit.co`.
- **Disparador**: abrir la app en el dominio de Pages.
- **Camino feliz**:
  1. La versión de Pages muestra un aviso: "MagniFit se mudó: exporta tu respaldo y ábrelo en app.magnifit.co".
  2. Exportación del respaldo con un toque y enlace al dominio nuevo.
  3. En el dominio nuevo, restaurar; con cuenta, el respaldo se fusiona y se sube.
- **Casos borde**: el usuario ignora el aviso y Pages se apaga; respaldo de una versión anterior del formato; restauración sobre un dispositivo que ya tiene datos.
- **Datos**: respaldo v3 completo.
- **API**: ninguna nueva.
- **Superficies**: `web/src/features/account/routes/Settings.tsx`, `web/src/app/App.tsx`, `.github/workflows/deploy.yml`.
- **Criterio de aceptación**: ningún usuario de Pages pierde datos cuando se retira ese despliegue.
- **Dependencias**: ninguna. Debe hacerse antes de retirar Pages.

### F1. Bienvenida y configuración inicial (P0, L, falta)

- **Objetivo**: un usuario nuevo configura su propio perfil en lugar de heredar el del dueño.
- **Estado verificado**: la primera apertura siembra altura 173, metas, una medida del 2026-08-03 con 83 kg y un bloque fijo 2026-11-16 a 2027-02-07; el contenido de la guía es específico para protrusión discal.
- **Disparador**: primera apertura sin configuración guardada (`store.tsx:79`).
- **Camino feliz**:
  1. Pantalla de bienvenida con el aviso médico.
  2. Altura, medidas actuales opcionales y metas.
  3. Inicio del bloque (por defecto el lunes siguiente) y duración (12 semanas).
  4. Elección de plantilla de plan: la actual de "espalda protegida" o una genérica.
  5. Invitación opcional a crear cuenta o iniciar sesión.
- **Casos borde**: omitir pasos no debe sembrar medidas falsas; un usuario existente nunca debe ver la bienvenida; restaurar un respaldo desde la bienvenida; la detección de datos de siembra en el primer inicio de sesión (`engine.ts:413-422`) debe reconocer las siembras nuevas.
- **Datos**: configuración, plan, medidas.
- **API**: ninguna nueva; viaja por la sincronización.
- **Superficies**: `web/src/lib/store.tsx`, `web/src/lib/plan.ts`, `web/src/lib/defaultPlan.ts`, nuevo `web/src/features/onboarding/`, `web/src/app/App.tsx`.
- **Criterio de aceptación**: una instalación nueva no tiene la medida del 2026-08-03 ni metas fijas; el bloque empieza en la fecha elegida; las instalaciones existentes no cambian.
- **Dependencias**: F19 para la invitación a crear cuenta.

### F19 y F20. Crear cuenta, iniciar sesión, recuperar contraseña (P0, S, parcial)

- **Objetivo**: que la cuenta sea alcanzable y funcione en producción.
- **Disparador**: la bienvenida, un aviso de "respalda tus datos" en Hoy, o Perfil.
- **Camino feliz**: ventana de Clerk (registro, verificación de correo, inicio de sesión) y luego la subida inicial de datos locales.
- **Casos borde**: el módulo de Clerk no carga sin conexión (ya resuelto en `app/providers.tsx:15-17`); inicio de sesión mientras la API del plan gratuito arranca en frío.
- **Trabajo restante**:
  - Configurar la clave de producción de Clerk y los registros DNS (T7).
  - Confirmar en el panel de Clerk que la verificación de correo y la recuperación de contraseña están activas.
  - Añadir una entrada fuera de Ajustes.
- **API**: existente.
- **Criterio de aceptación**: un usuario nuevo crea su cuenta, verifica el correo, recupera la contraseña y ve "Sincronizado".

### F30 y F31. Eliminar cuenta y borrar datos en la nube (P0, M, falta)

- **Objetivo**: el usuario elimina su cuenta y todos sus datos del servidor. Es una expectativa de privacidad y de las tiendas de aplicaciones.
- **Disparador**: Perfil, zona de peligro: "Eliminar cuenta" o "Borrar mis datos en la nube".
- **Camino feliz**:
  1. Doble confirmación, con oferta de exportar primero.
  2. La API borra las filas; la fila de `users` borra en cascada el resto (`api/migrations/00001_init.sql:29`).
  3. Se elimina el usuario en Clerk, por la API de Clerk o por un webhook `user.deleted`.
  4. Borrado local y cierre de sesión.
- **Casos borde**: sin conexión, la acción se bloquea; ante un fallo parcial, Clerk se borra al final; otro dispositivo con los datos los vuelve a subir, así que el servidor debe rechazar envíos de un usuario eliminado o los demás dispositivos deben borrar al recibir 401 o 410.
- **Datos**: todas las tablas del usuario.
- **API nueva**: `DELETE /v1/me` (datos y cuenta) y, si se separa, `DELETE /v1/data`; opcional `POST /webhooks/clerk` con verificación de firma.
- **Superficies**: `api/openapi.yaml`, `api/internal/adapter/httpapi/router.go`, `api/internal/usecase/sync/service.go`, `api/internal/adapter/postgres/queries/users.sql`, `web/src/features/account/routes/Settings.tsx`, `web/src/features/sync/api.ts`.
- **Riesgo**: datos irreversibles y seguridad; requiere verificación independiente.
- **Criterio de aceptación**: después del borrado, `GET /v1/sync` para ese usuario no devuelve nada y no quedan filas.

### F21 y F22. Cerrar sesión y cambiar de cuenta (P1, M, parcial)

- **Objetivo**: cierre de sesión seguro en un dispositivo compartido o vendido.
- **Disparador**: botón de usuario, "Cerrar sesión".
- **Camino feliz**:
  1. Al cerrar sesión, elegir "Mantener datos en este dispositivo" o "Borrar datos de este dispositivo".
  2. Advertir si la cola de salida tiene cambios pendientes.
  3. La segunda opción borra la base local, el estado de sincronización y el borrador de sesión activa.
- **Casos borde**: cerrar sesión sin conexión con cambios pendientes los perdería; iniciar sesión con otra cuenta hoy se detiene en un error de "otra cuenta" (`engine.ts:163`), donde conviene ofrecer "exportar y cambiar".
- **API**: ninguna.
- **Superficies**: `web/src/features/account/components/clerkAuth.tsx`, `web/src/features/account/routes/Settings.tsx`, `web/src/features/sync/lib/syncDb.ts`.
- **Criterio de aceptación**: tras "borrar" no queda ningún dato del usuario anterior en IndexedDB ni en localStorage.

### F26 y F27. Conflictos y uso en varios dispositivos (P1, M–L, parcial)

- **Objetivo**: un registro de hábito, una meta o una edición del plan hechos en el dispositivo A no se borran en silencio desde el B.
- **Causa verificada**: `config` y `plan` son un documento cada uno, con la regla de que gana la última escritura. Un envío desactualizado sale de la cola y la descarga completa lo sobrescribe (`engine.ts:296-311`).
- **Opciones**:
  - Separar los registros de hábito y las intenciones en registros propios. Requiere entidades nuevas en la base y en el contrato.
  - Fusionar `config` campo por campo en el cliente antes de enviar.
  - En ambos casos, avisar "esto cambió en otro dispositivo".
- **Casos borde**: una rutina borrada frente a una editada; zonas horarias en las fechas de registro; un entrenamiento en curso vive solo en un dispositivo.
- **API**: tipos de registro nuevos (cambio de contrato) o ninguna si se fusiona en el cliente.
- **Superficies**: `web/src/features/sync/lib/engine.ts`, `web/src/lib/plan.ts`, `web/src/features/habit/lib/habit.ts`.
- **Criterio de aceptación**: dos registros de hábito hechos sin conexión en dos dispositivos sobreviven ambos tras sincronizar.
- **Decisión pendiente**: cuál de las dos opciones tomar.

### F23. Sesión expirada (P1, S, parcial)

- **Disparador**: la API responde 401, o no hay token mientras la app cree tener sesión.
- **Camino feliz**:
  1. Detener el ciclo de reintentos.
  2. Mostrar "Tu sesión expiró, vuelve a iniciar sesión".
  3. Conservar la cola de salida y reanudar al iniciar sesión.
- **Casos borde**: reloj desfasado; Clerk sin conexión debe seguir contando como "sin conexión" (`engine.ts:205`).
- **Superficies**: `web/src/features/sync/lib/engine.ts`, `web/src/features/sync/lib/statusText.ts`, `web/src/features/sync/api.ts`.
- **Criterio de aceptación**: un 401 produce un estado propio, sin reintento indefinido y sin pérdida de datos.

### F8. Fin de bloque e inicio de uno nuevo (P1, M, parcial)

- **Objetivo**: seguir progresando después de la semana 12.
- **Disparador**: hoy es posterior al fin del bloque, o la semana es mayor que 12.
- **Camino feliz**:
  1. Hoy muestra "Bloque terminado".
  2. Comparación de la semana 1 contra la 12.
  3. "Empezar nuevo bloque" fija fechas nuevas y permite arrastrar las metas.
- **Casos borde**: un bloque pasado conserva su historial; hoy una fecha de inicio futura se trata como semana 1 (`phases.ts:11`).
- **API**: ninguna.
- **Superficies**: `web/src/features/today/routes/Home.tsx`, `web/src/lib/phases.ts`, `web/src/features/account/routes/Settings.tsx`.
- **Criterio de aceptación**: después de la semana 12 el usuario ve un estado de fin de bloque, no series base sin explicación.

### F7. Editar una sesión terminada (P1, M, parcial)

- **Objetivo**: corregir un peso o unas repeticiones mal digitados.
- **Disparador**: detalle de sesión (`Train.tsx:77`).
- **Camino feliz**: Editar, reutilizar el editor de sesión conservando la hora de fin, Guardar. Se sincroniza solo porque actualiza por identificador.
- **Casos borde**: edición simultánea en otro dispositivo (gana la última, aceptable); las series no hechas se filtraron al terminar (`Train.tsx:58`).
- **API**: existente.
- **Superficies**: `web/src/features/session/routes/Train.tsx`, `web/src/features/session/routes/ActiveSession.tsx`.
- **Criterio de aceptación**: la edición persiste, recalcula volumen y progreso, y llega a otro dispositivo.

### F16 y F34. Instalación, actualización e indicador de estado (P2, S–M, parcial)

- Aviso de instalación: evento de instalación en Android y escritorio; instrucciones de "Añadir a pantalla de inicio" en iOS.
- Aviso de "versión nueva disponible" que no interrumpa un entrenamiento en curso.
- Indicador pequeño de sincronización y de "sin conexión" en la estructura de la app, con un estado "conectando con el servidor" mientras la API del plan gratuito arranca.
- **Superficies**: `web/vite.config.ts`, `web/src/app/App.tsx`, `web/src/features/sync/lib/useSync.ts`.

### F14 y F15. Respaldo robusto y borrado completo (P2, S, parcial)

- Hacer la importación en una sola transacción, o prepararla y luego intercambiar.
- Avisar cuando el plan guardado está dañado, en lugar de volver al plan por defecto sin decirlo.
- El borrado total debe limpiar también el borrador de sesión activa en localStorage.
- **Superficies**: `web/src/lib/db.ts`, `web/src/lib/store.tsx`, `web/src/features/session/lib/activeSession.ts`.

### F28. Cambios rechazados por el servidor (P2, S, parcial)

Añadir "Reintentar" y "Descartar" por cada registro rechazado; ya se guardan en `web/src/features/sync/lib/syncDb.ts:127`. Sin API nueva.

### F29. Recordatorios de entrenamiento (P2, M, falta)

Recordar a la hora planeada usando las intenciones guardadas (`Habit.tsx:52-62`). Las notificaciones locales necesitan el service worker y permiso; en iOS, la app instalada. Las notificaciones desde el servidor necesitarían una API nueva (suscripciones y un planificador). Es una suposición de producto, no una especificación.

### F11. Calentamiento editable (decisión abierta)

Pendiente de una decisión de producto (`odd/tasks/editable-plan.md:51`). No requiere código todavía.

## Orden sugerido

1. F33, antes de retirar GitHub Pages.
2. F19 y F20, junto con el cierre del despliegue (T7).
3. F1, que desbloquea a cualquier usuario distinto del dueño.
4. F30 y F31, antes de abrir el registro al público.
5. F21, F23, F8 y F7.
6. F26, después de decidir entre separar registros o fusionar en el cliente.
7. El resto de P2.
