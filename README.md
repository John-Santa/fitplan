# FitPlan

Bitácora personal de entrenamiento y composición corporal para el bloque del 4 de agosto al 28 de septiembre de 2026.

PWA **local-first**: todos los datos viven en IndexedDB dentro del dispositivo. No hay servidor, no hay cuenta, no hay analítica y funciona sin señal — que es exactamente lo que se necesita en el sótano de un gimnasio.

## Qué hace

**Entrenar.** Las tres rutinas (pierna, empuje, tracción) vienen precargadas con sus 20 ejercicios en máquina, sus rangos de repeticiones y sus tiempos de descanso. Durante la sesión:

- Al marcar una serie arranca solo el temporizador de descanso, que vibra y suena al terminar.
- Cada ejercicio muestra **los pesos y repeticiones de la sesión anterior**, y los usa como marcador de posición en los campos. Sin eso no hay progresión, solo repetición.
- Cuando completaste todas las series en el extremo alto del rango, aparece el aviso **«sube peso»** — la doble progresión calculada sola.
- El número de series se ajusta a la semana del bloque: en las semanas 1–2 y en la 8 se resta una serie por ejercicio automáticamente.
- Guarda el número de asiento de cada máquina y te lo muestra la próxima vez.
- Cada ejercicio enlaza a su demostración en MuscleWiki.

**Medidas.** Bitácora de bioimpedancia y cinta cada dos semanas. Calcula masa magra, ratio músculo/grasa, FFMI, IMC, índice cintura/estatura y agua sobre masa magra; compara contra la línea base y contra la meta de la semana 8, y grafica la tendencia.

**Inicio.** Qué toca hoy según el día de la semana, en qué semana del bloque vas y cómo va la composición.

**Ajustes.** Exportar e importar respaldo en JSON, cambiar estatura, fechas del bloque y metas.

## Correrlo

```bash
npm install
npm run dev
```

## Publicar en GitHub Pages

1. Crea el repo y sube esto.
2. En **Settings → Pages**, elige *Source: GitHub Actions*.
3. Empuja a `main`. El workflow de `.github/workflows/deploy.yml` compila e inyecta el `base` correcto a partir del nombre del repo.
4. Entra desde el celular a `https://<usuario>.github.io/<repo>/` y usa *Añadir a pantalla de inicio*. A partir de ahí abre como app, a pantalla completa y sin conexión.

> El service worker solo funciona sobre HTTPS o en `localhost`. GitHub Pages da HTTPS, así que no hay nada más que configurar.

## Los datos son tuyos, y esa es también la responsabilidad

Todo está en IndexedDB de **ese** navegador. Si borras los datos del sitio, cambias de teléfono o desinstalas la app, se pierden. **Exporta el respaldo una vez al mes** desde Ajustes y guárdalo donde tengas copia.

Si más adelante quieres sincronizar entre dispositivos, el punto de entrada es `src/lib/db.ts`: toda la persistencia pasa por ahí y por `exportBackup()` / `importBackup()`. Reemplazar esa capa por una API remota no toca ninguna vista.

## Estructura

```
src/
  types.ts              Modelo de datos
  lib/db.ts             IndexedDB: sesiones, medidas, notas, configuración, respaldo
  lib/store.tsx         Contexto de React sobre la base de datos
  lib/plan.ts           Las 3 rutinas, la línea base, las metas y las fases del bloque
  lib/calc.ts           Derivadas de composición, métricas de entrenamiento, doble progresión
  components/Chart.tsx  Gráfica de líneas en SVG con leyenda, metas y tooltip
  components/ui.tsx     Tiles, temporizador de descanso, toast
  views/                Inicio, Entrenar, Sesión activa, Progresión, Medidas, Ajustes
```

Los identificadores de ejercicio en `lib/plan.ts` (`leg-press`, `chest-press`, …) son la llave del historial. Si cambias uno, el historial de ese ejercicio queda huérfano.

## Cambiar el plan

Todo el contenido del bloque está en `src/lib/plan.ts`: rutinas, ejercicios, series, rangos, descansos, línea base, metas y la prescripción semana a semana. No hay nada del plan escrito en las vistas.

---

Herramienta personal de seguimiento. No sustituye valoración médica ni nutricional.
