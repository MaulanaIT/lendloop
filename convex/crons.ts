import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly("clock tick", { minuteUTC: 0 }, internal.clock.tick);
crons.interval("expire stale deliveries", { minutes: 5 }, internal.notifications.expireStale);

export default crons;
