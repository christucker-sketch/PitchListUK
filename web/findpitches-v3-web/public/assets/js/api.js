/*
 * FindPitches customer API facade. Every screen talks ONLY to window.FP.api.
 * In the V3 site there is exactly one adapter: FP.v3Api (assets/js/v3-api.js) → same-origin /api/v3/*.
 */
(function () {
  const FP = (window.FP = window.FP || {});
  if (!FP.v3Api) throw new Error('assets/js/v3-api.js must be loaded before assets/js/api.js');
  FP.api = FP.v3Api;
})();
