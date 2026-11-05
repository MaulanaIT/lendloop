/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as clock from "../clock.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_automationStats from "../lib/automationStats.js";
import type * as lib_loanViews from "../lib/loanViews.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_people from "../lib/people.js";
import type * as lib_refs from "../lib/refs.js";
import type * as lib_today from "../lib/today.js";
import type * as lib_toolState from "../lib/toolState.js";
import type * as lib_validators from "../lib/validators.js";
import type * as loans from "../loans.js";
import type * as n8n from "../n8n.js";
import type * as notifications from "../notifications.js";
import type * as seed from "../seed.js";
import type * as tools from "../tools.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  clock: typeof clock;
  crons: typeof crons;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/automationStats": typeof lib_automationStats;
  "lib/loanViews": typeof lib_loanViews;
  "lib/notify": typeof lib_notify;
  "lib/people": typeof lib_people;
  "lib/refs": typeof lib_refs;
  "lib/today": typeof lib_today;
  "lib/toolState": typeof lib_toolState;
  "lib/validators": typeof lib_validators;
  loans: typeof loans;
  n8n: typeof n8n;
  notifications: typeof notifications;
  seed: typeof seed;
  tools: typeof tools;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
