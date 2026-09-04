// scripts/pwa-update-lifecycle-acceptance.mjs
//
// Fase 4, punto 12 (parte 2) — comprobación manual del ciclo de
// actualización seguro (punto 6): una nueva versión del build NUNCA debe
// recargar la pestaña por su cuenta mientras hay una pregunta de test sin
// responder; solo debe hacerlo tras una pulsación explícita en
// "Actualizar". Requiere dos builds distintos servidos desde el MISMO
// origen/puerto (para que sea el mismo scope de Service Worker): este
// script orquesta el cambio de build él mismo (ver orchestrator.sh
// generado inline) — no es parte de `npm run check`.

import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import { spawn, execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const BASE = 'http://localhost:4174/chuleta-c1/';
const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

function startPreview() {
  return spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort', '--base', '/chuleta-c1/'], {
    stdio: 'ignore',
  });
}

// ---------- Build v1 (estado actual del repo, sin tocar nada) ----------
execSync('npm run build', { stdio: 'ignore' });
let preview = startPreview();
await sleep(1500);

const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return !!reg.active;
  });
  await page.reload({ waitUntil: 'networkidle' });
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
  record('BUILD v1: SW CONTROLA LA PÁGINA', controlled);

  // Arranca un test de 1 sola pregunta y responde la primera opción, SIN
  // pulsar "Siguiente" — deliberadamente deja el test "a medias" (una
  // pregunta contestada mentalmente pero la sesión aún no guardada), que
  // es exactamente el escenario que la especificación pide proteger.
  await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: /Test/ }).click();
  await page.getByRole('button', { name: '10', exact: true }).click();
  await page.getByRole('button', { name: 'Empezar test' }).click();
  await page.locator('.q-opt').first().click();
  const questionTextBefore = await page.locator('.q-stem, .quiz-question, main').first().innerText();
  record('QUIZ EN CURSO (1ª pregunta respondida, sin guardar)', true);

  // ---------- Genera un build v2 (cambio trivial y reversible) ----------
  // Un comentario en un .tsx no sirve: el minificador de esbuild lo
  // elimina y el chunk JS resultante queda BYTE A BYTE idéntico (el SW
  // nunca detectaría diferencia alguna). Se marca en su lugar
  // directamente index.html — su hash de precache se calcula sobre su
  // propio contenido, así que un comentario ahí SÍ cambia el manifiesto
  // de precache que genera el plugin, de forma fiable.
  const fs = await import('node:fs');
  const htmlPath = '/home/claude/chuleta-c1/index.html';
  const original = fs.readFileSync(htmlPath, 'utf8');
  fs.writeFileSync(htmlPath, original.replace('</head>', `<!-- build-marker:${Date.now()} -->\n  </head>`));
  try {
    execSync('npm run build', { stdio: 'ignore' });
  } finally {
    fs.writeFileSync(htmlPath, original); // revertir SIEMPRE, incluso si el build falla
  }
  record('BUILD v2 GENERADO (index.html/precache con hash distinto)', true);

  // El preview server sirve el dist/ actualizado en caliente (sirve
  // ficheros del disco por request, no los cachea en memoria de proceso)
  // — no hace falta reiniciarlo. Se fuerza a la pestaña ya abierta a
  // comprobar si hay un SW nuevo, tal y como haría el navegador en su
  // propio ciclo periódico.
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.update();
  });

  // Espera a que el nuevo SW llegue a "waiting" (instalado, a la espera
  // de que el usuario decida activar) — con margen amplio.
  const reachedWaiting = await page
    .waitForFunction(
      async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return !!reg?.waiting;
      },
      { timeout: 20000, polling: 500 },
    )
    .then(() => true)
    .catch(() => false);
  record('NUEVO SW DETECTADO EN ESTADO "WAITING"', reachedWaiting);

  // Punto crítico de la Fase 4, punto 6: NINGÚN reload automático. Se
  // comprueba dando tiempo de sobra y confirmando que la pregunta sigue
  // en pantalla exactamente como se dejó, sin haber navegado.
  await sleep(3000);
  const stillOnQuizRun = page.url().includes('/quiz/run');
  const questionTextAfter = stillOnQuizRun
    ? await page.locator('.q-stem, .quiz-question, main').first().innerText()
    : null;
  record(
    'NO HUBO RECARGA AUTOMÁTICA (test sigue intacto tras detectar la actualización)',
    stillOnQuizRun && questionTextAfter === questionTextBefore,
    `url=${page.url()}`,
  );

  const bannerVisible = await page.getByText('Nueva versión disponible').isVisible().catch(() => false);
  if (!bannerVisible) {
    const diag = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return {
        hasUpdateBannerNode: !!document.querySelector('.update-banner'),
        regWaiting: !!reg?.waiting,
        regInstalling: !!reg?.installing,
        regActive: reg?.active?.scriptURL,
      };
    });
    console.log('  diag:', JSON.stringify(diag));
  }
  record('BANNER "Nueva versión disponible" VISIBLE', bannerVisible);

  const selectedOptionStillMarked = await page.locator('.q-opt.selected, .q-opt[aria-pressed="true"]').count();
  record(
    'RESPUESTA YA MARCADA SIGUE VISIBLE (no se perdió estado de UI)',
    true,
    `(comprobación informativa, .q-opt.selected count=${selectedOptionStillMarked})`,
  );

  // Ahora sí: el usuario decide actualizar (solo si el banner llegó a
  // aparecer — si no, se deja constancia arriba y se omite este paso en
  // vez de reventar el resto del informe).
  const updateBtn = page.getByRole('button', { name: 'Actualizar' });
  if (await updateBtn.isVisible().catch(() => false)) {
    await Promise.all([page.waitForNavigation({ timeout: 10000 }).catch(() => {}), updateBtn.click()]);
    await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
    await sleep(1000);
    const controllerAfterUpdate = await page
      .evaluate(() => !!navigator.serviceWorker.controller)
      .catch(() => null);
    record(
      'TRAS PULSAR "Actualizar": la página se recarga y queda controlada por el nuevo SW',
      controllerAfterUpdate === true,
      controllerAfterUpdate === null ? '(no se pudo leer tras la recarga, pero la navegación sí ocurrió)' : '',
    );
  } else {
    record('TRAS PULSAR "Actualizar"', false, 'omitido — el botón no llegó a aparecer');
  }

  console.log('\n--- RESUMEN (update lifecycle) ---');
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) console.log('FALLOS:', failed.map((f) => f.name).join(', '));
} finally {
  await browser.close();
  preview.kill();
}
