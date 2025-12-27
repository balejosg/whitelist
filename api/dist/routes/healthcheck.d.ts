/**
 * Healthcheck Routes
 *
 * Kubernetes-style health probes:
 * - /health/live  - Liveness probe (is the process running?)
 * - /health/ready - Readiness probe (can the service handle requests?)
 */
declare const router: import("express-serve-static-core").Router;
export default router;
//# sourceMappingURL=healthcheck.d.ts.map