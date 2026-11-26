import { z } from "zod";
import { badRequest } from "@/src/lib/api-error";

// Sanity bounds, not product targets: they protect one atomic write and reject
// obvious GPS/input bugs. Simplified routes are ~150–250 points per km.
export const RUN_LIMITS = {
  maxDistanceMeters: 200_000,
  maxSeconds: 43_200,
  maxRoutePoints: 20_000,
  maxPolylineChars: 200_000,
  maxSplits: 200,
  // Accepted relative difference between the decoded route length and the
  // reported distance, plus a small absolute slack for very short runs.
  routeDistanceTolerance: 0.25,
  routeDistanceSlackMeters: 50,
} as const;

const distanceSchema = z.number().finite().min(1).max(RUN_LIMITS.maxDistanceMeters);
const secondsSchema = z.number().int().min(1).max(RUN_LIMITS.maxSeconds);

export const runSplitSchema = z.object({
  index: z.number().int().min(1).max(RUN_LIMITS.maxSplits),
  distanceMeters: distanceSchema,
  seconds: secondsSchema,
}).strict();

export const runRouteSchema = z.object({
  encoding: z.literal("polyline5").describe("Google encoded polyline algorithm, precision 1e5, latitude/longitude order."),
  polyline: z.string().min(2).max(RUN_LIMITS.maxPolylineChars).regex(/^[\x3f-\x7e]+$/, "Polyline must use encoded polyline characters only"),
  pointCount: z.number().int().min(2).max(RUN_LIMITS.maxRoutePoints),
}).strict();

export const routeBoundsSchema = z.object({
  south: z.number().min(-90).max(90), west: z.number().min(-180).max(180),
  north: z.number().min(-90).max(90), east: z.number().min(-180).max(180),
}).strict();

function checkSplits(splits: z.infer<typeof runSplitSchema>[], distanceMeters: number, movingSeconds: number | undefined | null, ctx: z.RefinementCtx) {
  splits.forEach((split, i) => {
    if (split.index !== i + 1) ctx.addIssue({ code: "custom", path: ["splits", i, "index"], message: "Split indexes must be consecutive from 1" });
  });
  if (!splits.length) return;
  const total = splits.reduce((n, s) => n + s.distanceMeters, 0);
  if (Math.abs(total - distanceMeters) > Math.max(RUN_LIMITS.routeDistanceSlackMeters, distanceMeters * 0.02)) {
    ctx.addIssue({ code: "custom", path: ["splits"], message: "Split distances must add up to distanceMeters" });
  }
  const seconds = splits.reduce((n, s) => n + s.seconds, 0);
  if (movingSeconds != null && seconds > movingSeconds) ctx.addIssue({ code: "custom", path: ["splits"], message: "Split seconds must not exceed movingSeconds" });
}

// Client input for POST /workouts source "run". Pace/speed/bounds are server-only.
export const runInputSchema = z.object({
  version: z.literal("1"),
  distanceSource: z.enum(["gps", "manual"]).describe("gps: live tracked run (current); manual: user-entered past run."),
  distanceMeters: distanceSchema,
  movingSeconds: secondsSchema.optional().describe("gps only: active time excluding pauses."),
  splits: z.array(runSplitSchema).max(RUN_LIMITS.maxSplits).optional().describe("gps only: consecutive splits, usually per kilometre; the last may be shorter."),
  route: runRouteSchema.optional().describe("Required for gps, forbidden for manual."),
}).strict().superRefine((value, ctx) => {
  if (value.distanceSource === "gps") {
    if (!value.route) ctx.addIssue({ code: "custom", path: ["route"], message: "A gps run requires route" });
    if (value.movingSeconds === undefined) ctx.addIssue({ code: "custom", path: ["movingSeconds"], message: "A gps run requires movingSeconds" });
  } else {
    for (const field of ["route", "splits", "movingSeconds"] as const) {
      if (value[field] !== undefined) ctx.addIssue({ code: "custom", path: [field], message: `A manual run must omit ${field}` });
    }
  }
  checkSplits(value.splits ?? [], value.distanceMeters, value.movingSeconds, ctx);
});

// Stored/returned shape. GET /workouts list omits `route` but keeps hasRoute.
export const runLogSchema = z.object({
  version: z.literal("1"),
  distanceSource: z.enum(["gps", "manual"]),
  distanceMeters: distanceSchema,
  movingSeconds: secondsSchema.nullable(),
  splits: z.array(runSplitSchema).max(RUN_LIMITS.maxSplits),
  hasRoute: z.boolean(),
  route: runRouteSchema.nullable().optional(),
  routeBounds: routeBoundsSchema.nullable(),
  routeDistanceMeters: z.number().finite().min(0).nullable().describe("Server-computed haversine length of the decoded route."),
}).strict().superRefine((value, ctx) => {
  if (value.route !== undefined && (value.route !== null) !== value.hasRoute) ctx.addIssue({ code: "custom", path: ["hasRoute"], message: "hasRoute must match route" });
  if (value.hasRoute !== (value.routeBounds !== null)) ctx.addIssue({ code: "custom", path: ["routeBounds"], message: "routeBounds are present only with a route" });
  checkSplits(value.splits, value.distanceMeters, value.movingSeconds, ctx);
});
export type RunLog = z.infer<typeof runLogSchema>;

export function decodePolyline(encoded: string, maxPoints: number = RUN_LIMITS.maxRoutePoints) {
  const points: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;
  const next = () => {
    let result = 0, shift = 0, byte: number;
    do {
      if (index >= encoded.length) throw badRequest("INVALID_ROUTE", "Route polyline is truncated");
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63 || shift > 30) throw badRequest("INVALID_ROUTE", "Route polyline is malformed");
      result |= (byte & 0x1f) << shift; shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next(); lng += next();
    if (points.length >= maxPoints) throw badRequest("INVALID_ROUTE", `Route exceeds ${maxPoints} points`);
    const point: [number, number] = [lat / 1e5, lng / 1e5];
    if (Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180) throw badRequest("INVALID_ROUTE", "Route coordinates are out of range");
    points.push(point);
  }
  return points;
}

export function haversineMeters(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180, dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function routeSummary(points: [number, number][]) {
  let distance = 0;
  const bounds = { south: points[0][0], west: points[0][1], north: points[0][0], east: points[0][1] };
  points.forEach((point, i) => {
    if (i) distance += haversineMeters(points[i - 1], point);
    bounds.south = Math.min(bounds.south, point[0]); bounds.north = Math.max(bounds.north, point[0]);
    bounds.west = Math.min(bounds.west, point[1]); bounds.east = Math.max(bounds.east, point[1]);
  });
  return { distanceMeters: Math.round(distance * 10) / 10, bounds };
}

type SessionTiming = { source: "timer" | "user_reported"; durationSeconds?: number } | undefined;

// Canonical stored run log. Throws 400 for timing/route inconsistencies that a
// schema alone cannot check (decoded route, elapsed timestamps).
export function canonicalRunLog(run: z.infer<typeof runInputSchema>, timing: SessionTiming, startedAt: string, finishedAt: string): RunLog {
  if (run.distanceSource === "gps" && timing?.source !== "timer") throw badRequest("INVALID_SESSION_TIMING", "A gps run requires sessionTiming source timer");
  if (run.distanceSource === "manual" && timing?.source !== "user_reported") throw badRequest("INVALID_SESSION_TIMING", "A manual run requires sessionTiming source user_reported with durationSeconds");
  const elapsed = Math.floor((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000);
  if (run.movingSeconds !== undefined && run.movingSeconds > elapsed) throw badRequest("INCONSISTENT_RUN_DURATION", "movingSeconds must not exceed finishedAt - startedAt");
  let summary: ReturnType<typeof routeSummary> | null = null;
  if (run.route) {
    const points = decodePolyline(run.route.polyline);
    if (points.length !== run.route.pointCount) throw badRequest("INVALID_ROUTE", "Route pointCount does not match the decoded polyline");
    summary = routeSummary(points);
    const allowed = run.distanceMeters * RUN_LIMITS.routeDistanceTolerance + RUN_LIMITS.routeDistanceSlackMeters;
    if (Math.abs(summary.distanceMeters - run.distanceMeters) > allowed) throw badRequest("ROUTE_DISTANCE_MISMATCH", "Route length differs from distanceMeters by more than 25%");
  }
  return {
    version: "1", distanceSource: run.distanceSource, distanceMeters: run.distanceMeters,
    movingSeconds: run.movingSeconds ?? null, splits: run.splits ?? [],
    hasRoute: run.route !== undefined, route: run.route ?? null,
    routeBounds: summary?.bounds ?? null, routeDistanceMeters: summary?.distanceMeters ?? null,
  };
}

export function runPace(distanceMeters: number, seconds: number) {
  return {
    avgPaceSecondsPerKm: Math.round(seconds / (distanceMeters / 1000)),
    avgSpeedKmh: Math.round((distanceMeters / 1000) / (seconds / 3600) * 100) / 100,
  };
}

// List projection: keep summary fields, drop the heavy polyline.
export function listRunLog(log: unknown) {
  if (!log || typeof log !== "object") return null;
  const { route: _route, ...rest } = log as Record<string, unknown>; void _route;
  return rest;
}
