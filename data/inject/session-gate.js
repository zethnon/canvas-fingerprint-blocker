/* This registration is explicitly NOT persisted across browser sessions.
 * It is enabled only AFTER the worker has installed this session's seeded
 * script. MAIN consumes this marker synchronously at document_start, before
 * page scripts. There is no page-event or asynchronous activation channel.
 * If injection order changes, protection fails closed rather than using an
 * old seed. Never accept a marker published later by page code.
 */
(() => {
  'use strict';
  Object.defineProperty(globalThis, '__fpsSessionReadyV2', {
    configurable: true, value: true
  });
})();
