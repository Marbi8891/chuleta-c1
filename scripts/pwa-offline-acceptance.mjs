// scripts/pwa-offline-acceptance.mjs
//
// Fase 4, punto 12 — ACEPTACIÓN MANUAL OFFLINE, automatizada con
// Playwright/Chromium contra el build de producción real servido con el
// mismo base path que GitHub Pages ("/chuleta-c1/", ver vite.config.ts).
// No es parte de `npm run check` (es una comprobación manual puntual de
// esta fase, no un test de regresión permanente) — se ejecuta a mano y su
// salida se pega tal cual en el checkpoint de la Fase 4.
//
// Requiere que `npm run build` se haya ejecutado antes y que nada esté
// sirviendo ya el puerto 4173.

// NOTA: 'playwright' se importa por ruta absoluta a su instalación global
// en este entorno de verificación (no es una dependencia del proyecto —
// esta comprobación es manual/puntual de la Fase 4, no parte de
// `npm run check`). Si se ejecuta en otra máquina, ajustar esta ruta o
// instalar Playwright como devDependency temporal.
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = 'http://localhost:4173/chuleta-c1/';
const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

const preview = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort', '--base', '/chuleta-c1/'], {
  stdio: 'ignore',
});
await sleep(1500);

const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();

  // ---------- 1. Carga ONLINE, primera visita ----------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const homeHeading = await page.getByRole('heading', { name: 'Hoy' }).isVisible();
  record('CARGA INICIAL ONLINE', homeHeading);

  // El SW instalado en la PRIMERA visita nunca controla esa misma carga
  // (comportamiento estándar del navegador sin `clientsClaim()`, que
  // vite-plugin-pwa no activa por defecto — a propósito: evita que
  // recursos ya en vuelo se intercepten a mitad de carga con un SW de
  // otra versión). "Después de UNA visita online" (literal de la
  // especificación, punto 4) implica recargar una vez para que el SW ya
  // activo empiece a controlar la pestaña — así se comprueba aquí.
  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('serviceWorker no soportado');
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  record('SERVICE WORKER INSTALADO Y ACTIVO (1ª visita)', true);

  await page.reload({ waitUntil: 'networkidle' });
  const hasController = await page.evaluate(
    () => !!navigator.serviceWorker.controller,
  );
  record('SERVICE WORKER CONTROLA LA PÁGINA (tras recarga)', hasController);

  const swState = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return {
      scope: reg?.scope,
      active: reg?.active?.state,
    };
  });
  record('SW SCOPE CORRECTO', swState.scope?.includes('/chuleta-c1/'), JSON.stringify(swState));

  // ---------- 2. Genera progreso real en IndexedDB, online ----------
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: /Temario/ }).click();
  const topicLink = page.locator('a[href$="/study/I-T01"]');
  await topicLink.waitFor({ timeout: 15000 });
  await topicLink.click();
  await page.waitForURL(/\/study\/I-T01/);
  const studyLoaded = await page.locator('.study-article, article, main').first().isVisible();
  record('ABRIR TEMA DE ESTUDIO (ONLINE)', studyLoaded);

  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: /Test/ }).click();
  await page.getByRole('button', { name: '10', exact: true }).click();
  await page.getByRole('button', { name: 'Empezar test' }).click();
  for (let i = 0; i < 10; i++) {
    await page.locator('.q-opt').first().click();
    await page.getByRole('button', { name: /^(Siguiente|Reintentar)$/ }).click();
    // Última pregunta: el guardado es async (Fase 3B) — el botón puede
    // pasar brevemente por "Guardando…" antes de navegar a resultados o
    // (si algo falla) mostrar "Reintentar". Se espera a que ese estado
    // transitorio termine antes de la siguiente iteración/verificación.
    await page.getByRole('button', { name: 'Guardando…' }).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }
  let resultsVisible = await page.getByText(/de 10 preguntas correctas/).isVisible({ timeout: 10000 }).catch(() => false);
  if (!resultsVisible) {
    // Diagnóstico: puede que el guardado fallara una vez (mock de red
    // inestable) y quede en "Reintentar" — un reintento más es
    // exactamente el comportamiento esperado de SAFE QUIZ COMPLETION
    // (Fase 3B), no un fallo de esta comprobación.
    const retryBtn = page.getByRole('button', { name: 'Reintentar' });
    if (await retryBtn.isVisible().catch(() => false)) {
      await retryBtn.click();
      resultsVisible = await page.getByText(/de 10 preguntas correctas/).isVisible({ timeout: 10000 }).catch(() => false);
    }
  }
  record('COMPLETAR TEST (ONLINE, GENERA quizSessions EN INDEXEDDB)', resultsVisible, `url=${page.url()}`);

  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: /Repaso/ }).click();
  await page.locator('.flip-card').first().click();
  await page.getByRole('button', { name: 'Lo sé' }).click();
  // setFlashcardKnown es fire-and-forget (Fase 3B, punto 5) — se espera a
  // que la fila exista de verdad en Dexie antes de continuar, en vez de
  // asumir que el clic ya la escribió.
  const flashcardWritten = await page
    .waitForFunction(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open('chuletaC1');
          req.onsuccess = () => {
            const db = req.result;
            db.transaction('flashcardProgress', 'readonly').objectStore('flashcardProgress').count().onsuccess = (
              ev,
            ) => resolve(ev.target.result >= 1);
          };
        }),
      { timeout: 5000 },
    )
    .then(() => true)
    .catch(() => false);
  record('MARCAR FLASHCARD "LO SÉ" (ONLINE, GENERA flashcardProgress)', flashcardWritten);

  // ---------- 3. OFFLINE ----------
  await context.setOffline(true);
  record('NETWORK OFFLINE ACTIVADO (context.setOffline)', true);

  const routes = [
    ['/chuleta-c1/', 'OFFLINE HOME'],
    ['/chuleta-c1/study', 'OFFLINE STUDY (lista)'],
    ['/chuleta-c1/study/I-T01', 'OFFLINE STUDY (tema profundo, deep route)'],
    ['/chuleta-c1/quiz', 'OFFLINE QUIZ (selección)'],
    ['/chuleta-c1/flashcards', 'OFFLINE FLASHCARDS'],
  ];
  for (const [path, label] of routes) {
    try {
      await page.goto('http://localhost:4173' + path, { waitUntil: 'load', timeout: 8000 });
      const bodyText = await page.locator('body').innerText();
      const looksOk = !/no se puede acceder|err_internet|this site can.t be reached/i.test(bodyText);
      record(label, looksOk, `url=${page.url()}`);
    } catch (e) {
      record(label, false, String(e).slice(0, 200));
    }
  }

  // quiz/run y quiz/results son rutas dependientes de estado de React
  // (no de navegación directa por URL en la app real: se llega a ellas
  // SIEMPRE mediante navegación cliente desde /quiz, nunca escribiendo la
  // URL a mano, ver QuizContext.startQuiz/goNext). Se comprueba en su
  // lugar que /quiz/run como deep-route (recarga directa) sigue sirviendo
  // el shell offline sin un error de red — el guard de "sin test en
  // curso" de la propia app es un comportamiento correcto, no un fallo.
  try {
    await page.goto('http://localhost:4173/chuleta-c1/quiz/run', { waitUntil: 'load', timeout: 8000 });
    const bodyText = await page.locator('body').innerText();
    const looksOk = !/no se puede acceder|err_internet/i.test(bodyText);
    record('OFFLINE DEEP ROUTE /quiz/run (recarga directa sirve el shell)', looksOk);
  } catch (e) {
    record('OFFLINE DEEP ROUTE /quiz/run', false, String(e).slice(0, 200));
  }

  // ---------- 4. Persistencia offline ----------
  await page.goto(BASE, { waitUntil: 'load' });
  const persistedCounts = await page.evaluate(async () => {
    return await new Promise((resolve, reject) => {
      const req = indexedDB.open('chuletaC1');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['quizSessions', 'flashcardProgress'], 'readonly');
        const out = {};
        let pending = 2;
        tx.objectStore('quizSessions').count().onsuccess = (ev) => {
          out.quizSessions = ev.target.result;
          if (--pending === 0) resolve(out);
        };
        tx.objectStore('flashcardProgress').count().onsuccess = (ev) => {
          out.flashcardProgress = ev.target.result;
          if (--pending === 0) resolve(out);
        };
      };
    });
  });
  record(
    'PROGRESO SOBREVIVE OFFLINE (IndexedDB legible sin red)',
    persistedCounts.quizSessions >= 1 && persistedCounts.flashcardProgress >= 1,
    JSON.stringify(persistedCounts),
  );

  // Navegación cliente offline (sin recarga dura) entre vistas ya
  // visitadas — usa la propia bottom-nav, exactamente como un usuario.
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: /Temario/ }).click();
  const navWorksOffline = await page.getByRole('heading', { name: /Temario|Estudiar/i }).first().isVisible().catch(() => false)
    || (await page.locator('.study-row, .study-bloque-head').first().isVisible().catch(() => false));
  record('NAVEGACIÓN CLIENTE OFFLINE (bottom-nav)', navWorksOffline);

  // ---------- 5. Vuelta a online ----------
  await context.setOffline(false);
  record('NETWORK ONLINE RESTAURADO', true);

  console.log('\n--- RESUMEN ---');
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) {
    console.log('FALLOS:', failed.map((f) => f.name).join(', '));
  }
} finally {
  await browser.close();
  preview.kill();
}
